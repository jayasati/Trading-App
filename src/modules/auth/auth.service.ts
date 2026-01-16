import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';


import { UsersService } from '../users/users.service';
import { PrismaService } from 'src/prisma/prisma.service';



@Injectable()
export class AuthService{
    constructor(
        private usersService:UsersService,
        private jwtService:JwtService,
        private prisma :PrismaService,
    ){}

    private async issueTokens(
        userId:string,
        email:string,
        role:string
    ){
        const accessToken=this.jwtService.sign({
            sub:userId,
            email,
            role,
        });

        const refreshToken=randomUUID();

        await this.prisma.refreshToken.create({
            data:{
                token:refreshToken,
                userId,
                expiresAt:new Date(
                    Date.now()+7*24*60*60*100,
                ),
            },
        });

        return{
            accessToken,
            refreshToken,
        };
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

        const isMatch=await bcrypt.compare(password,user.password);
        if(!isMatch){
            throw new UnauthorizedException('Invalid Credentials');
        }
        return this.issueTokens(user.id,user.email,user.role);

    }

}