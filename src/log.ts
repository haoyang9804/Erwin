import fs from 'fs';
import { config } from './config';

export class Log {
  static log_stream : fs.WriteStream;

  static initialize() {
    if (fs.existsSync(config.log_file_path)) {
      fs.unlinkSync(config.log_file_path);
    }
    fs.writeFileSync(`${config.log_file_path}`, '', 'utf8');
    this.log_stream = fs.createWriteStream(config.log_file_path, { flags: 'a' });
  }

  static log(message : string) {
    if (!this.log_stream) {
      this.initialize();
    }
    if (config.debug) {
      this.log_stream.write(`${message}\n`);
    }
  }
}