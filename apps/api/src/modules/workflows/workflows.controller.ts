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

@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly workflows: WorkflowsService) {}

  @Get()
  list() {
    return this.workflows.list();
  }

  /** The flow orders run on, or the enquiry pipeline when asked for it. */
  @Get('default')
  getDefault(@Query('kind') kind?: string) {
    return this.workflows.getDefault(
      kind === 'LEAD' ? WorkflowKind.LEAD : WorkflowKind.ORDER,
    );
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.workflows.findOne(id);
  }

  @Get('statuses/:statusId/next')
  allowedNext(@Param('statusId') statusId: string) {
    return this.workflows.allowedNext(statusId);
  }

  /** Where this status came from, for a move that has to go back. */
  @Get('statuses/:statusId/back')
  allowedBack(@Param('statusId') statusId: string) {
    return this.workflows.allowedBack(statusId);
  }

  @Roles(UserRole.ADMIN)
  @Post()
  create(@Body() dto: CreateWorkflowDto) {
    return this.workflows.create(dto);
  }

  /** The flow itself: its name, and how long an enquiry may sit untouched. */
  @Roles(UserRole.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateWorkflowDto) {
    return this.workflows.update(id, dto);
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

  /** Which stages the home screen counts, and in what order they sit there. */
  @Roles(UserRole.ADMIN)
  @Patch(':id/home-card')
  setHomeCard(@Param('id') id: string, @Body() dto: HomeCardDto) {
    return this.workflows.setHomeCard(id, dto.statusIds);
  }
}
