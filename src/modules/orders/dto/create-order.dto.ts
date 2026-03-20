import { IsEnum, IsNumber, IsUUID, Min, IsInt } from 'class-validator';
import { OrderSide, OrderType } from '../../../generated/prisma/client';

export class CreateOrderDto {
  @IsUUID()
  stockId: string;

  @IsEnum(OrderSide)
  side: OrderSide;

  @IsEnum(OrderType)
  type: OrderType;

  @IsNumber()
  @Min(1)
  price: number;

  @IsInt()
  @Min(1)
  quantity: number;
}