import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const config= new DocumentBuilder()
    .setTitle('Trading App API')
    .setDescription('Paper Trading App')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document=SwaggerModule.createDocument(app,config);
  SwaggerModule.setup('api',app,document);
  
  app.enableCors({
    origin:['http://localhost:3000/'], //frontend Url (updte for production)
    methods:'GET,HEAD,PUT,PATCH,POST,DELETE',
    Credential:true,
  });

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
