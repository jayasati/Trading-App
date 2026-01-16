import { Injectable } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";

import { Role } from 'src/generated/prisma/client';



@Injectable()
export class UsersService{
    constructor(private prisma : PrismaService){}

    findByEmail(email:string){
        return this.prisma.user.findUnique({where:{email}});
    }

    createUser(email:string,password:string ,name?:string){
        return this.prisma.user.create({
            data:{
                email,
                password,
                name,
                role:Role.USER,
            },
        });
    }
}