import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { SmsModule } from './sms/sms.module';
import { OtpService } from './otp.service';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AccessTokenStrategy } from './jwt/access-token.strategy';

@Module({
  imports: [PassportModule, JwtModule.register({}), SmsModule],
  controllers: [AuthController],
  providers: [OtpService, AuthService, AccessTokenStrategy],
  exports: [AuthService],
})
export class AuthModule {}
