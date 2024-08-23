import fs from 'fs';
import path from 'path';

/**
 *
 * @param content
 */
export async function transformIndexHtml(content: string): Promise<string> {
  const script = await fs.promises.readFile(
    path.join(__dirname, '../scripts/restore-theme.js'),
    'utf-8',
  );

  return content.replace(/<head>/, `<head><script>${script}</script>`);
}
