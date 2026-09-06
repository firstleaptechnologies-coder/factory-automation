import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { OrderStatus, Priority, Uom } from '@prisma/client';

export class OrderItemDto {
  @IsString() description: string;
  @IsOptional() @IsString() designId?: string;
  @IsString() materialId: string;
  @Type(() => Number) @IsNumber() @Min(0.001) quantity: number;
  @IsEnum(Uom) uom: Uom;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) lengthMm?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) widthMm?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) thicknessMm?: number;
  @Type(() => Number) @IsNumber() @Min(0) unitPrice: number;
}

export class CreateOrderDto {
  @IsString() customerId: string;
  @IsOptional() @IsString() poNumber?: string;
  @IsOptional() @IsEnum(Priority) priority?: Priority;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsString() notes?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];
}

export class UpdateOrderStatusDto {
  @IsEnum(OrderStatus) status: OrderStatus;
  @IsOptional() @IsString() note?: string;
}

export class OrderQueryDto {
  @IsOptional() @IsEnum(OrderStatus) status?: OrderStatus;
  @IsOptional() @IsString() customerId?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit = 25;

  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}
