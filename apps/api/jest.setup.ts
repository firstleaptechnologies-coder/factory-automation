// DTOs carry class-validator decorators, which need the metadata polyfill.
import 'reflect-metadata';
import { Logger } from '@nestjs/common';

// Services log on start-up. Useful in the app, noise in a test report — and it
// hides the assertion that actually failed.
Logger.overrideLogger(false);
