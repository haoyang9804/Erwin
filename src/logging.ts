import * as fs from 'fs';

export class Log {
  filepath : string = "log.txt";
  constructor() { }
  write(message : string) {
    try {
      if (!fs.existsSync(this.filepath)) {
        fs.writeFileSync(this.filepath, message, 'utf-8');
      } else {
        fs.appendFileSync(this.filepath, message, 'utf-8');
      }
    } catch (error) {
      console.error('Error creating file:', error);
    }
  }
}