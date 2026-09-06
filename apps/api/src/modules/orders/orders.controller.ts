import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import { DEFAULT_UNIT, LengthUnit, isLengthUnit } from '@decor/shared';
import { OrdersService } from './orders.service';
import {
  AttachmentMetaDto,
  ChangeStatusDto,
  OrderQueryDto,
  PunchOrderDto,
  UpdateOrderDto,
} from './dto/order.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import { IncomingFile } from '../files/files.service';
import { MAX_UPLOAD_BYTES } from '@decor/shared';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@Query() query: OrderQueryDto) {
    return this.orders.list(query);
  }

  @Get('board')
  board(@Query('workflowId') workflowId?: string) {
    return this.orders.board(workflowId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Query('unit') unit?: string) {
    return this.orders.findOne(id, resolveUnit(unit));
  }

  @Roles(UserRole.SALES, UserRole.MANAGER)
  @Post()
  punch(
    @Body() dto: PunchOrderDto,
    @CurrentUser() user: AuthUser,
    @Query('unit') unit?: string,
  ) {
    return this.orders.punch(dto, user?.id, resolveUnit(unit));
  }

  @Roles(UserRole.SALES, UserRole.MANAGER)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateOrderDto) {
    return this.orders.update(id, dto);
  }

  @Post(':id/status')
  changeStatus(
    @Param('id') id: string,
    @Body() dto: ChangeStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orders.changeStatus(id, dto, user);
  }

  /**
   * Reference images and size images arrive here. `kind` picks the field and
   * decides how hard the optimiser compresses; reference images additionally
   * require a description.
   */
  @Roles(UserRole.SALES, UserRole.MANAGER, UserRole.PRODUCTION)
  @Post(':id/attachments')
  @UseInterceptors(FilesInterceptor('files', 10, { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  addAttachments(
    @Param('id') id: string,
    @UploadedFiles() files: IncomingFile[],
    @Body() meta: AttachmentMetaDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.orders.addAttachments(id, files, meta, user?.id);
  }

  @Roles(UserRole.SALES, UserRole.MANAGER)
  @Delete('attachments/:attachmentId')
  removeAttachment(@Param('attachmentId') attachmentId: string) {
    return this.orders.removeAttachment(attachmentId);
  }
}

function resolveUnit(unit?: string): LengthUnit {
  return isLengthUnit(unit) ? unit : DEFAULT_UNIT;
}
