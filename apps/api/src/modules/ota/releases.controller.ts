import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PERMISSIONS } from '@decor/shared';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { AuthUser, CurrentUser } from '../../common/decorators/current-user.decorator';
import type { IncomingFile } from '../files/files.service';
import { ReleasesService } from './releases.service';
import {
  CreateReleaseDto,
  UpdateReleaseDto,
  UploadAssetDto,
  VersionGateDto,
} from './dto/release.dto';

/**
 * The release console, for whoever owns the product.
 *
 * Not a tenant screen: there is one app in the stores for every workspace, and
 * a shop's admin decides how their shop works rather than what code the phone
 * in their hand is running.
 */
@Controller('platform/releases')
export class ReleasesController {
  constructor(private readonly releases: ReleasesService) {}

  @RequirePermissions(PERMISSIONS.PLATFORM_RELEASE_VIEW)
  @Get()
  list(@Query('channel') channel?: string, @Query('platform') platform?: string) {
    return this.releases.list(channel, platform);
  }

  @RequirePermissions(PERMISSIONS.PLATFORM_RELEASE_VIEW)
  @Get(':id')
  one(@Param('id') id: string) {
    return this.releases.one(id);
  }

  @RequirePermissions(PERMISSIONS.PLATFORM_RELEASE_MANAGE)
  @Post()
  create(@Body() dto: CreateReleaseDto) {
    return this.releases.create(dto);
  }

  /** The JS bundle, or one of the files it needs. */
  @RequirePermissions(PERMISSIONS.PLATFORM_RELEASE_MANAGE)
  @Post(':id/assets')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @Param('id') id: string,
    @UploadedFile() file: IncomingFile,
    @Body() dto: UploadAssetDto,
  ) {
    if (!file) throw new BadRequestException('No file was uploaded');
    return this.releases.addAsset(id, file, dto.launch === 'true');
  }

  /** Publish it, move the rollout, or retire it. */
  @RequirePermissions(PERMISSIONS.PLATFORM_RELEASE_MANAGE)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateReleaseDto, @CurrentUser() user: AuthUser) {
    return this.releases.update(id, dto, user?.id);
  }

  @RequirePermissions(PERMISSIONS.PLATFORM_RELEASE_VIEW)
  @Get('gates/all')
  gates() {
    return this.releases.gates();
  }

  @RequirePermissions(PERMISSIONS.PLATFORM_RELEASE_MANAGE)
  @Put('gates')
  setGate(@Body() dto: VersionGateDto) {
    return this.releases.setGate(dto);
  }
}
