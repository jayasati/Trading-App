import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RoleGaurd } from 'src/common/guards/roles.guard';

@Controller('users')
export class usersController{

    @UseGuards(JwtAuthGuard)
    @Get('me')
    getProfile(@Req() req){
        return req.user;
    }

    @Roles('ADMIN')
    @UseGuards(JwtAuthGuard,RoleGaurd)
    @Get('admin')
    adminOnly(){
        return 'Admin acess granted';
    }
}