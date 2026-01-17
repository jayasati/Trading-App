import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class StocksService {
    constructor(private prisma :PrismaService){}

    async create(data:{
        symbol:string;
        name:string;
        exchange:string;
        isActive?:boolean;
    }){
        const exsiting =await this.prisma.stock.findUnique({
            where:{symbol:data.symbol},
        });
        if(exsiting){
            throw new ConflictException('Stock Alreaady Exsist');
        }
        return this.prisma.stock.create({data});
    }

    async findall(){
        return this.prisma.stock.findMany({
            where:{isActive:true},
            orderBy:{symbol:'asc'},
        });
    }

    async search(query:string){
        return this.prisma.stock.findMany({
            where:{
                isActive:true,
                OR:[
                    {symbol:{contains:query,mode:"insensitive"}},
                    {name:{contains:query,mode:"insensitive"}},
                ],
            },
        });
    }

}
