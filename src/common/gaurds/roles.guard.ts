import {
  CanActivate,
  ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Observable } from 'rxjs';

//CanActivate → interface for all guards
//Reflector -> Used to read metadata  || Specifically metadata added by decorators (@Roles)

/*
After a user is authenticated,
this guard decides whether the user is allowed to
access a route based on their role.
*/
@Injectable()
export class RoleGaurd implements CanActivate{
    constructor(private reflector :Reflector){}

    canActivate(context: ExecutionContext): boolean {
        const roles=this.reflector.getAllAndOverride<string[]>(
            ROLES_KEY,
            [context.getHandler(),context.getClass()],
        );
        if(!roles)return true;
        /*
            If route does NOT specify roles
            Then any authenticated user can access
        */
        const { user } = context.switchToHttp().getRequest();
        return roles.includes(user.role);
    }


}