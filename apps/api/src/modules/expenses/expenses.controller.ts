import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ExpenseOptionField } from '@prisma/client';
import { MAX_UPLOAD_BYTES, MODULES, PERMISSIONS } from '@fas/shared';
import { ExpensesService } from './expenses.service';
import {
  ExpenseAnalyticsQueryDto,
  ExpenseDto,
  ExpenseOptionDto,
  ExpenseQueryDto,
  ReorderExpenseOptionsDto,
  ReverseExpenseDto,
  UpdateExpenseOptionDto,
} from './dto/expense.dto';
import { IncomingFile } from '../files/files.service';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { RequireModule } from '../../common/decorators/module.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';

@RequireModule(MODULES.EXPENSES)
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  // -- options --------------------------------------------------------------

  /** What the form should offer, grouped by field. */
  @RequirePermissions(PERMISSIONS.EXPENSE_VIEW)
  @Get('options')
  optionsForForm() {
    return this.expenses.optionsForForm();
  }

  /** Every option including the retired ones — the config screen. */
  @RequirePermissions(PERMISSIONS.EXPENSE_CONFIG)
  @Get('options/all')
  listOptions(@Query('field') field?: ExpenseOptionField) {
    return this.expenses.listOptions(field);
  }

  @RequirePermissions(PERMISSIONS.EXPENSE_CONFIG)
  @Post('options')
  createOption(@Body() dto: ExpenseOptionDto) {
    return this.expenses.createOption(dto);
  }

  @RequirePermissions(PERMISSIONS.EXPENSE_CONFIG)
  @Patch('options/order')
  reorderOptions(@Body() dto: ReorderExpenseOptionsDto) {
    return this.expenses.reorderOptions(dto);
  }

  @RequirePermissions(PERMISSIONS.EXPENSE_CONFIG)
  @Patch('options/:id')
  updateOption(@Param('id') id: string, @Body() dto: UpdateExpenseOptionDto) {
    return this.expenses.updateOption(id, dto);
  }

  @RequirePermissions(PERMISSIONS.EXPENSE_CONFIG)
  @Delete('options/:id')
  removeOption(@Param('id') id: string) {
    return this.expenses.removeOption(id);
  }

  // -- expenses -------------------------------------------------------------

  @RequirePermissions(PERMISSIONS.EXPENSE_VIEW)
  @Get('analytics')
  analytics(@Query() query: ExpenseAnalyticsQueryDto) {
    return this.expenses.analytics(query);
  }

  @RequirePermissions(PERMISSIONS.EXPENSE_VIEW)
  @Get()
  list(@Query() query: ExpenseQueryDto) {
    return this.expenses.list(query);
  }

  @RequirePermissions(PERMISSIONS.EXPENSE_VIEW)
  @Get(':id')
  get(@Param('id') id: string) {
    return this.expenses.get(id);
  }

  @RequirePermissions(PERMISSIONS.EXPENSE_MANAGE)
  @Post()
  create(@Body() dto: ExpenseDto, @CurrentUser() user?: AuthUser) {
    return this.expenses.create(dto, user?.id);
  }

  /**
   * The whole expense, not a patch of it.
   *
   * `ExpenseDto` requires every field, so a half-filled body is refused rather
   * than quietly clearing the tax details somebody recorded last week — and
   * the ledger row, rewritten from whatever arrives here, cannot end up
   * describing a row that no longer says that.
   */
  @RequirePermissions(PERMISSIONS.EXPENSE_MANAGE)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: ExpenseDto, @CurrentUser() user?: AuthUser) {
    return this.expenses.update(id, dto, user?.id);
  }

  /**
   * Takes an expense back. There is no delete.
   *
   * The opposite row is recorded and both stand, exactly as taking a receipt
   * back does: money that moved is never quietly unmoved.
   */
  @RequirePermissions(PERMISSIONS.EXPENSE_MANAGE)
  @Post(':id/reverse')
  reverse(
    @Param('id') id: string,
    @Body() dto: ReverseExpenseDto,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.expenses.reverse(id, dto.reason, user?.id);
  }

  /** What changed on this expense, and why. */
  @RequirePermissions(PERMISSIONS.EXPENSE_VIEW)
  @Get(':id/edits')
  editHistory(@Param('id') id: string) {
    return this.expenses.editHistory(id);
  }

  /** The bill, photographed at the counter. One per expense. */
  @RequirePermissions(PERMISSIONS.EXPENSE_MANAGE)
  @Post(':id/bill')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  attachBill(
    @Param('id') id: string,
    @UploadedFile() file: IncomingFile,
    @CurrentUser() user?: AuthUser,
  ) {
    return this.expenses.attachBill(id, file, user?.id);
  }

  @RequirePermissions(PERMISSIONS.EXPENSE_MANAGE)
  @Delete(':id/bill')
  removeBill(@Param('id') id: string) {
    return this.expenses.removeBill(id);
  }
}
