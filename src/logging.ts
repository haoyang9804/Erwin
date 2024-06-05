import * as fs from 'fs';

export class Log {
  filepath : string = "log.txt";
  constructor() {
    if (fs.existsSync(this.filepath))
      fs.unlinkSync(this.filepath);
  }
  write(message : string) {
    try {
      if (!fs.existsSync(this.filepath)) {
        fs.writeFileSync(this.filepath, message + "\n", 'utf-8');
      } else {
        fs.appendFileSync(this.filepath, message + "\n", 'utf-8');
      }
    } catch (error) {
      console.error('Error creating file:', error);
    }
  }
}