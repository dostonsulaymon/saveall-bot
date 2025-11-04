# 🚀 Universal Downloader Bot - Modular Architecture

## 📁 Final Project Structure

```
src/
├── config/
│   ├── config.module.ts
│   ├── config.schema.ts
│   └── config.service.ts
├── modules/
│   ├── bot/
│   │   ├── commands/
│   │   │   ├── broadcast.command.ts
│   │   │   ├── start.command.ts
│   │   │   └── stats.command.ts
│   │   ├── handlers/
│   │   │   └── message.handler.ts
│   │   ├── keyboards/
│   │   │   └── youtube.keyboard.ts
│   │   ├── services/
│   │   │   └── media-sender.service.ts
│   │   ├── bot.module.ts
│   │   ├── bot.service.ts
│   │   └── bot.update.ts
│   ├── cache/
│   │   ├── repositories/
│   │   │   └── media.repository.ts
│   │   ├── cache.module.ts
│   │   └── cache.service.ts
│   ├── database/
│   │   ├── schemas/
│   │   │   ├── media.schema.ts
│   │   │   └── user.schema.ts
│   │   └── database.module.ts
│   ├── download/
│   │   ├── dto/
│   │   │   └── download-job.dto.ts
│   │   ├── strategies/
│   │   │   ├── generic.strategy.ts
│   │   │   ├── instagram.strategy.ts
│   │   │   └── youtube.strategy.ts
│   │   ├── download.module.ts
│   │   └── download.service.ts
│   ├── platform/
│   │   ├── detectors/
│   │   │   └── url.detector.ts
│   │   ├── platform.module.ts
│   │   └── platform.service.ts
│   ├── storage/
│   │   ├── providers/
│   │   │   └── local.provider.ts
│   │   ├── storage.module.ts
│   │   └── storage.service.ts
│   └── user/
│       ├── repositories/
│       │   └── user.repository.ts
│       ├── user.module.ts
│       └── user.service.ts
├── app.controller.ts
├── app.module.ts
├── app.service.ts
└── main.ts
```

## 📦 Installation Steps

### 1. Install Dependencies

```bash
npm install @nestjs/common @nestjs/core @nestjs/config @nestjs/mongoose @nestjs/platform-express
npm install grammy nestjs-grammy mongoose axios joi
npm install -D @nestjs/cli @nestjs/schematics @types/node typescript
```

### 2. Create Environment File

Create `.env` file in root:

```env
NODE_ENV=development
PORT=3000

BOT_TOKEN=your_bot_token_here
ADMIN_ID=your_telegram_user_id

MONGODB_URI=mongodb://localhost:27017/downloader_bot

CACHE_DAYS=30
MAX_FILE_SIZE=52428800
DOWNLOAD_DIR=downloads
```

### 3. Update tsconfig.json

```json
{
  "compilerOptions": {
    "module": "commonjs",
    "declaration": true,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "target": "ES2021",
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "strictNullChecks": false,
    "noImplicitAny": false,
    "strictBindCallApply": false,
    "forceConsistentCasingInFileNames": false,
    "noFallthroughCasesInSwitch": false
  }
}
```

## 🔄 Migration from Old Code

### Step-by-Step Migration:

1. **Keep your old code as backup**
2. **Copy all the artifacts I created into your project**
3. **Install dependencies**
4. **Update your .env file**
5. **Test the bot**

### Quick Start:

```bash
# Development mode
npm run start:dev

# Production mode
npm run build
npm run start:prod
```

## ✨ Key Improvements

### 1. **Separation of Concerns**
- Each module has a single responsibility
- Easy to test and maintain
- Clear dependencies

### 2. **Repository Pattern**
- Database operations are isolated
- Easy to switch databases
- Testable without database

### 3. **Strategy Pattern**
- Each platform has its own download strategy
- Easy to add new platforms
- Centralized download logic

### 4. **Dependency Injection**
- All dependencies are injected
- Easy to mock for testing
- Loose coupling

### 5. **Type Safety**
- Full TypeScript support
- Better IDE autocomplete
- Catch errors at compile time

## 🎯 Module Responsibilities

| Module | Responsibility |
|--------|---------------|
| **Config** | Environment configuration & validation |
| **Database** | MongoDB connection & schemas |
| **User** | User management & tracking |
| **Cache** | Media caching with MongoDB |
| **Platform** | URL detection & validation |
| **Download** | Media download with strategies |
| **Storage** | File management & cleanup |
| **Bot** | Telegram bot logic & handlers |

## 🔧 Adding New Features

### Add a New Platform (Example: Snapchat):

1. **Create Strategy**:
```typescript
// src/modules/download/strategies/snapchat.strategy.ts
@Injectable()
export class SnapchatDownloadStrategy {
  constructor(private genericStrategy: GenericDownloadStrategy) {}
  
  async download(url: string): Promise<DownloadResult[]> {
    const options = ['--snapchat-specific-options'];
    return this.genericStrategy.download(url, options);
  }
}
```

2. **Register in Download Module**:
```typescript
providers: [
  // ...
  SnapchatDownloadStrategy,
]
```

3. **Update Platform Detection**:
```typescript
// src/modules/platform/detectors/url.detector.ts
snapchat: /snapchat\.com/i,
```

4. **Use in Download Service**:
```typescript
if (platform === 'snapchat') {
  return await this.snapchatStrategy.download(url);
}
```

## 🧪 Testing

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

## 📊 Performance Optimization

1. **Caching**: MongoDB TTL indexes for auto-cleanup
2. **File Cleanup**: Automatic cleanup of old files
3. **Memory Management**: Files deleted after upload
4. **Error Handling**: Comprehensive error messages

## 🚀 Deployment

### Docker (Recommended):

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
CMD ["npm", "run", "start:prod"]
```

### PM2:

```bash
npm install -g pm2
pm2 start dist/main.js --name "downloader-bot"
```

## 🔐 Security Best Practices

1. ✅ Environment variables for secrets
2. ✅ Input validation with Joi
3. ✅ File size limits
4. ✅ Admin-only commands
5. ✅ Error message sanitization

## 📝 Notes

- Make sure `yt-dlp` is installed on your system
- MongoDB should be running
- Bot token should be valid
- Admin ID should be your Telegram user ID

## 🆘 Troubleshooting

**Bot not starting?**
- Check BOT_TOKEN in .env
- Ensure MongoDB is running
- Check yt-dlp installation: `yt-dlp --version`

**Downloads failing?**
- Update yt-dlp: `yt-dlp -U`
- Check internet connection
- Verify platform URL patterns

**Cache not working?**
- Check MongoDB connection
- Verify TTL index creation
- Check CACHE_DAYS configuration

## 🎉 Success!

Your bot is now fully modularized and production-ready! Each component is:
- ✅ Independent
- ✅ Testable
- ✅ Maintainable
- ✅ Scalable