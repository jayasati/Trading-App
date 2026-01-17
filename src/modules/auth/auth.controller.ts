import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';


@ApiTags('Auth')
@Controller('auth')
export class AuthController{
    constructor(private authService:AuthService){}

    @Post('signup')
    signup(@Body() dto:SignupDto){
        return this.authService.signup(dto.email,dto.password,dto.name);
    }

    @Post('login')
    login(@Body() dto:LoginDto){
        return this.authService.login(dto.email,dto.password);
    }
    @Post('refresh')
    refresh(@Body('refreshToken') refreshToken: string) {
        return this.authService.refresh(refreshToken);
    }

    @Post('logout')
    logout(@Body('refreshToken') refreshToken: string) {
        return this.authService.logout(refreshToken);
    }
}