import { Controller, Get, UseGuards, Req } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RoleGaurd } from '../../common/guards/roles.guard';

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