import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { UserRole, WorkflowKind } from '@prisma/client';
import { WorkflowsService } from './workflows.service';
import {
  CreateWorkflowDto,
  HomeCardDto,
  SaveGraphDto,
  UpdateWorkflowDto,
  StatusDto,
  UpdateStatusDto,
} from './dto/workflow.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { PERMISSIONS } from '@fas/shared';

@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @RequirePermissions(PERMISSIONS.CONFIG_VIEW)
  @Get()
  list() {
    return this.workflows.list();
  }

  /** The flow orders run on, or the enquiry pipeline when asked for it. */
  @RequirePermissions(PERMISSIONS.CONFIG_VIEW)
  @Get('default')
  getDefault(@Query('kind') kind?: string) {
    return this.workflows.getDefault(
      kind === 'LEAD' ? WorkflowKind.LEAD : WorkflowKind.ORDER,
    );
  }

  @RequirePermissions(PERMISSIONS.CONFIG_VIEW)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.workflows.findOne(id);
  }

  @RequirePermissions(PERMISSIONS.ORDER_VIEW)
  @Get('statuses/:statusId/next')
  allowedNext(@Param('statusId') statusId: string) {
    return this.workflows.allowedNext(statusId);
  }

  /** Where this status came from, for a move that has to go back. */
  @RequirePermissions(PERMISSIONS.ORDER_VIEW)
  @Get('statuses/:statusId/back')
  allowedBack(@Param('statusId') statusId: string) {
    return this.workflows.allowedBack(statusId);
  }

  @RequirePermissions(PERMISSIONS.WORKFLOW_MANAGE)
  @Post()
  create(@Body() dto: CreateWorkflowDto) {
    return this.workflows.create(dto);
  }

  /** The flow itself: its name, and how long an enquiry may sit untouched. */
  @RequirePermissions(PERMISSIONS.WORKFLOW_MANAGE)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateWorkflowDto) {
    return this.workflows.update(id, dto);
  }

  @RequirePermissions(PERMISSIONS.WORKFLOW_MANAGE)
  @Patch(':id/default')
  setDefault(@Param('id') id: string) {
    return this.workflows.setDefault(id);
  }

  @RequirePermissions(PERMISSIONS.WORKFLOW_MANAGE)
  @Post(':id/statuses')
  addStatus(@Param('id') id: string, @Body() dto: StatusDto) {
    return this.workflows.addStatus(id, dto);
  }

  @RequirePermissions(PERMISSIONS.WORKFLOW_MANAGE)
  @Patch('statuses/:statusId')
  updateStatus(@Param('statusId') statusId: string, @Body() dto: UpdateStatusDto) {
    return this.workflows.updateStatus(statusId, dto);
  }

  @RequirePermissions(PERMISSIONS.WORKFLOW_MANAGE)
  @Delete('statuses/:statusId')
  removeStatus(@Param('statusId') statusId: string) {
    return this.workflows.removeStatus(statusId);
  }

  /** Called by the drag-and-drop builder when the admin hits Save. */
  @RequirePermissions(PERMISSIONS.WORKFLOW_MANAGE)
  @Post(':id/graph')
  saveGraph(@Param('id') id: string, @Body() dto: SaveGraphDto) {
    return this.workflows.saveGraph(id, dto);
  }

  /** Which stages the home screen counts, and in what order they sit there. */
  @RequirePermissions(PERMISSIONS.WORKFLOW_MANAGE)
  @Patch(':id/home-card')
  setHomeCard(@Param('id') id: string, @Body() dto: HomeCardDto) {
    return this.workflows.setHomeCard(id, dto.statusIds);
  }
}
