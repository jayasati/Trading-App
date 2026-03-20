import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '../../generated/prisma/client';


@Injectable()
export class HoldingsService{
    constructor(private prisma :PrismaService){}

    async addHolding(userId:string,
        stockId:string,
        quantity:number,
        tx:Prisma.TransactionClient,
    ){

        await tx.holding.upsert({
            where:{
                userId_stockId:{
                    userId,
                    stockId,
                },
            },
            update:{
                quantity:{increment:quantity},
            },
            create:{
                userId,
                stockId,
                quantity,
            },
        });
    }

    async removeHolding(
        userId:string,
        stockId:string,
        quantity:number,
        tx:Prisma.TransactionClient,
    ){
        const holding=await tx.holding.findUnique({
            where:{
                userId_stockId:{
                    userId,
                    stockId
                },
            },
        });

        
        if(!holding || holding.quantity <quantity){
            throw new Error('Insufficient holdings');
        }

        if(holding.quantity===quantity){
            await tx.holding.delete({
                where:{id:holding.id},
            });
        }else{
            await tx.holding.update({
                where:{id:holding.id},
                data:{
                    quantity:{decrement:quantity},
                    lockedQty: { decrement: quantity },
                }
            });
        }

    }
}