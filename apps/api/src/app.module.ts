import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from './common/prisma/prisma.module';
import { CryptoModule } from './common/crypto/crypto.module';
import { ImagesModule } from './common/images/images.module';
import { StorageModule } from './common/storage/storage.module';
import { JobsModule } from './common/jobs/jobs.module';
import { TenancyModule } from './common/tenancy/tenancy.module';
import { TenantInterceptor } from './common/tenancy/tenant.interceptor';
import { ActorInterceptor } from './common/audit/actor.interceptor';
import { ServerLogInterceptor } from './common/logs/server-log.interceptor';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { ModuleGuard } from './common/guards/module.guard';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { HistoryModule } from './modules/history/history.module';
import { LogsModule } from './modules/logs/logs.module';
import { OtaModule } from './modules/ota/ota.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { LedgerModule } from './modules/ledger/ledger.module';
import { UsersModule } from './modules/users/users.module';
import { ClientsModule } from './modules/clients/clients.module';
import { ConfigurationModule } from './modules/config/config.module';
import { WorkflowsModule } from './modules/workflows/workflows.module';
import { OrdersModule } from './modules/orders/orders.module';
import { FilesModule } from './modules/files/files.module';
import { LeadsModule } from './modules/leads/leads.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { EstimatesModule } from './modules/estimates/estimates.module';
import { DisbursementsModule } from './modules/disbursements/disbursements.module';
import { ExpensesModule } from './modules/expenses/expenses.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { AttendanceModule } from './modules/attendance/attendance.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { RolesModule } from './modules/roles/roles.module';
import { LettersModule } from './modules/letters/letters.module';
import { PlatformModule } from './modules/platform/platform.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    /*
     * Rate limiting, applied where it is asked for rather than everywhere.
     *
     * Only the sign-in routes carry the guard: the apps poll the rest of the
     * API happily and being told to slow down mid-shift would read as the
     * product being broken.
     */
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 30 }]),
    PrismaModule,
    CryptoModule,
    TenancyModule,
    ImagesModule,
    StorageModule,
    JobsModule,
    AuthModule,
    HealthModule,
    HistoryModule,
    LogsModule,
    OtaModule,
    NotificationsModule,
    LedgerModule,
    UsersModule,
    ClientsModule,
    ConfigurationModule,
    WorkflowsModule,
    OrdersModule,
    FilesModule,
    LeadsModule,
    PaymentsModule,
    DisbursementsModule,
    ExpensesModule,
    EmployeesModule,
    AttendanceModule,
    PayrollModule,
    RolesModule,
    LettersModule,
    EstimatesModule,
    PlatformModule,
  ],
  providers: [
    // Order matters: authenticate, then put the tenant and the person in
    // context, then check what the caller is allowed to do.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ActorInterceptor },
    /*
     * Last, so it runs innermost: the tenant and the person are already in
     * context by the time it reads them, and the duration it measures is the
     * handler's rather than the whole chain's.
     */
    { provide: APP_INTERCEPTOR, useClass: ServerLogInterceptor },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    // What the workspace bought, beside what the person is allowed to do.
    { provide: APP_GUARD, useClass: ModuleGuard },
  ],
})
export class AppModule {}
