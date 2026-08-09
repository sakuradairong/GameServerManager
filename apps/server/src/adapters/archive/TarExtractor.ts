import * as tar from 'tar'
import fs from 'node:fs/promises'
import { createSafeTarExtractOptions } from '../../utils/tarSecurityFilter.js'

export async function extractTarGzArchive(archivePath: string, destination: string) {
  await fs.mkdir(destination, { recursive: true })
  await tar.extract(createSafeTarExtractOptions(archivePath, destination))
}
