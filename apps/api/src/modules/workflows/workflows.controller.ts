import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { WorkflowsService } from './workflows.service';
import {
  CreateWorkflowDto,
  SaveGraphDto,
  StatusDto,
  UpdateStatusDto,
} from './dto/workflow.dto';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @Get()
  list() {
    return this.workflows.list();
  }

  @Get('default')
  getDefault() {
    return this.workflows.getDefault();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.workflows.findOne(id);
  }

  @Get('statuses/:statusId/next')
  allowedNext(@Param('statusId') statusId: string) {
    return this.workflows.allowedNext(statusId);
  }

  @Roles(UserRole.ADMIN)
  @Post()
  create(@Body() dto: CreateWorkflowDto) {
    return this.workflows.create(dto);
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id/default')
  setDefault(@Param('id') id: string) {
    return this.workflows.setDefault(id);
  }

  @Roles(UserRole.ADMIN)
  @Post(':id/statuses')
  addStatus(@Param('id') id: string, @Body() dto: StatusDto) {
    return this.workflows.addStatus(id, dto);
  }

  @Roles(UserRole.ADMIN)
  @Patch('statuses/:statusId')
  updateStatus(@Param('statusId') statusId: string, @Body() dto: UpdateStatusDto) {
    return this.workflows.updateStatus(statusId, dto);
  }

  @Roles(UserRole.ADMIN)
  @Delete('statuses/:statusId')
  removeStatus(@Param('statusId') statusId: string) {
    return this.workflows.removeStatus(statusId);
  }

  /** Called by the drag-and-drop builder when the admin hits Save. */
  @Roles(UserRole.ADMIN)
  @Post(':id/graph')
  saveGraph(@Param('id') id: string, @Body() dto: SaveGraphDto) {
    return this.workflows.saveGraph(id, dto);
  }
}
