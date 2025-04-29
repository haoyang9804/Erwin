import fs from 'fs';
import { config } from './config';

export class Log {
  static initialize() {
    if (fs.existsSync(config.log_file_path)) {
      fs.unlinkSync(config.log_file_path);
    }
    fs.writeFileSync(`${config.log_file_path}`, '', 'utf8');
  }

  static log(message : string) {
    if (config.debug || config.unit_test_mode) {
      fs.writeFileSync(`${config.log_file_path}`, message + "\n", { flag: 'a' });
    }
  }

  static info(message: string) {
    const formattedMessage = `[INFO] ${message}`;
    console.log(formattedMessage);
    this.log(formattedMessage);
  }

  static warn(message: string) {
    const formattedMessage = `[WARN] ${message}`;
    console.warn(formattedMessage);
    this.log(formattedMessage);
  }

  static error(message: string) {
    const formattedMessage = `[ERROR] ${message}`;
    console.error(formattedMessage);
    this.log(formattedMessage);
  }
}