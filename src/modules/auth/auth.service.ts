
import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt'; //Used for secure password hashing
import { createHash, randomUUID } from 'crypto'; //Generates cryptographically secure UUIDs


import { UsersService } from '../users/users.service';
import { PrismaService } from '../../prisma/prisma.service';



@Injectable()
export class AuthService{
    constructor(
        private usersService:UsersService,
        private jwtService:JwtService,
        private prisma :PrismaService,
    ){}

    private async issueTokens(//the heart of auth
        userId:string,
        email:string,
        role:string
    ){  
        //Creates a JWT
        /*
        Payload contains:
            sub → standard JWT subject (user id)
            email
            role → for RBAC
            Expiry & secret come from AuthModule config.
        */
        const accessToken=this.jwtService.sign({
            sub:userId,
            email,
            role,
        });

        const refreshToken=randomUUID();
        const refreshTokenHash = this.hashRefreshToken(refreshToken);

        await this.prisma.refreshToken.create({
            data:{
                token:refreshTokenHash,
                userId,
                expiresAt:new Date(
                    Date.now() + this.getRefreshTokenTtlMs(),
                ),
            },
        });

        return{
            accessToken,
            refreshToken,
        };
    }

    private hashRefreshToken(token: string): string {
        return createHash('sha256').update(token).digest('hex');
    }

    private getRefreshTokenTtlMs(): number {
        const raw = process.env.JWT_REFRESH_EXPIRES_IN ?? '7d';
        const parsed = this.parseDurationMs(raw);
        return parsed ?? 7 * 24 * 60 * 60 * 1000;
    }

    private parseDurationMs(input: string): number | null {
        const trimmed = (input ?? '').trim();
        const match = /^(\d+)\s*([smhd])$/i.exec(trimmed);
        if (!match) return null;

        const value = Number(match[1]);
        if (!Number.isFinite(value) || value <= 0) return null;

        const unit = match[2].toLowerCase();
        const multiplier =
            unit === 's' ? 1000 :
            unit === 'm' ? 60 * 1000 :
            unit === 'h' ? 60 * 60 * 1000 :
            24 * 60 * 60 * 1000; // 'd'

        return value * multiplier;
    }

    async refresh(refreshToken:string){
        if (!refreshToken) {
            throw new UnauthorizedException('Refresh token missing');
        }

        const hashedToken = this.hashRefreshToken(refreshToken);

        // Backward compatibility: allow previously issued plaintext refresh tokens
        // during rollout, but all newly issued tokens are hashed at rest.
        let stored =await this.prisma.refreshToken.findUnique({
            where:{token :hashedToken},
            include:{user:true}
        });
        if(!stored){
            stored = await this.prisma.refreshToken.findUnique({
                where:{token :refreshToken},
                include:{user:true}
            });
        }

        if(!stored){
            throw new UnauthorizedException('Invalid refresh token');
        }
        if(stored.expiresAt < new Date()) {
            await this.prisma.refreshToken.deleteMany({
            where: { token: { in: [refreshToken, hashedToken] } },
            });
            throw new UnauthorizedException('Refresh token expired');
        }
        await this.prisma.refreshToken.delete({
            where: { id: stored.id },
        });
        return this.issueTokens(
            stored?.user.id,
            stored?.user.email,
            stored?.user.role,
        );
    }

    async logout(refreshToken: string) {
    if (!refreshToken) {
        return; // or throw BadRequestException
    }

    const hashedToken = this.hashRefreshToken(refreshToken);

    await this.prisma.refreshToken.deleteMany({
        where: { token: { in: [refreshToken, hashedToken] } },
    });
    }

    async signup(email:string,password:string,name?:string){
        const exsiting=await this.usersService.findByEmail(email);
        if(exsiting){
            throw new ConflictException('Email already registered');
        }

        const hashedPassword=await bcrypt.hash(password,10);
        const user=await this.usersService.createUser(
            email,
            hashedPassword,
            name
        );

        return this.issueTokens(user.id,user.email,user.role);
    }

    async login(email:string,password:string){
        const user=await this.usersService.findByEmail(email);

        if(!user){
            throw new UnauthorizedException('Invalid Credentials');
        }

        const isMatch=await bcrypt.compare(password,user.password);//entered password against stored password
        if(!isMatch){
            throw new UnauthorizedException('Invalid Credentials');
        }
        return this.issueTokens(user.id,user.email,user.role);

    }

}


