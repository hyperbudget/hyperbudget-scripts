import * as fs from 'fs';
import * as path from 'path';
import { SystemConfig } from '../config/system';

export class ConfigManager {
  static get_config(): Promise<SystemConfig> {
    return new Promise((resolve, reject) => (
      fs.readFile(
        path.join(__dirname, '/../../../config.json'),
        (err, config) => (
          err ? reject(err) : resolve(JSON.parse(config.toString())
        )
      )
    )))
  }
}