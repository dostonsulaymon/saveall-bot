import { AppService } from './app.service';

describe('AppService', () => {
  it('returns hello world text', () => {
    const service = new AppService();
    expect(service.getHello()).toBe('Hello World!');
  });
});

