import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from './common/prisma/prisma.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { ImagesModule } from './common/images/images.module';
import { StorageModule } from './common/storage/storage.module';
import { TenancyModule } from './common/tenancy/tenancy.module';
import { TenantInterceptor } from './common/tenancy/tenant.interceptor';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ClientsModule } from './modules/clients/clients.module';
import { ConfigurationModule } from './modules/config/config.module';
import { WorkflowsModule } from './modules/workflows/workflows.module';
import { OrdersModule } from './modules/orders/orders.module';
import { FilesModule } from './modules/files/files.module';
import { LeadsModule } from './modules/leads/leads.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PlatformModule } from './modules/platform/platform.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    CryptoModule,
    TenancyModule,
    ImagesModule,
    StorageModule,
    AuthModule,
    UsersModule,
    ClientsModule,
    ConfigurationModule,
    WorkflowsModule,
    OrdersModule,
    FilesModule,
    LeadsModule,
    PaymentsModule,
    PlatformModule,
  ],
  providers: [
    // Order matters: authenticate, then put the tenant in context, then check
    // what the caller is allowed to do.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
