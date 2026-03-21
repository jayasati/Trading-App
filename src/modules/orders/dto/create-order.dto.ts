// src/modules/orders/dto/create-order.dto.ts
import { IsEnum, IsNumber, IsUUID, Min, IsInt, IsOptional } from 'class-validator';
import { OrderSide, OrderType, OrderCategory } from '../../../generated/prisma/client';

export class CreateOrderDto {
  @IsUUID()
  stockId: string;

  @IsEnum(OrderSide)
  side: OrderSide;

  @IsEnum(OrderType)
  type: OrderType;

  @IsOptional()
  @IsEnum(OrderCategory)
  category?: OrderCategory; // DELIVERY | INTRADAY — defaults to DELIVERY

  @IsNumber()
  @Min(1)
  price: number;

  @IsInt()
  @Min(1)
  quantity: number;
}