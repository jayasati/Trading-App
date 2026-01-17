import { IsBoolean, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateStockDto {
  @IsNotEmpty()
  symbol: string;

  @IsNotEmpty()
  name: string;

  @IsNotEmpty()
  exchange: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}