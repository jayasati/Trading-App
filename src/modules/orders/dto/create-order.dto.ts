
import {
  IsDefined,
  IsEnum,
  IsNumber,
  IsUUID,
  Min,
  IsInt,
  IsOptional,
  ValidateIf,
} from 'class-validator';
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

  // Price is required for LIMIT/STOP_LOSS.
  // MARKET price is derived server-side while market is open.
  @ValidateIf((o: CreateOrderDto) => o.type !== OrderType.MARKET)
  @IsDefined()
  @IsNumber()
  @Min(1)
  price?: number;

  @IsInt()
  @Min(1)
  quantity: number;
}