import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateStockDto {
  @IsNotEmpty()
  symbol: string;

  @IsNotEmpty()
  name: string;

  @IsNotEmpty()
  exchange: string;

  @IsOptional()
  @IsString()
  yahooSymbol?: string;

  @IsOptional()
  @IsString()
  sector?: string;

  @IsOptional()
  @IsString()
  industry?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}