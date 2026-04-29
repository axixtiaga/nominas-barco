import { ParserHandler } from "./base";
import { genericParser } from "./generic";
import { laredoSanMartinParser } from "./laredo-sanmartin";
import { santonaDelPuertoParser } from "./santona-delpuerto";
import { ondarroaKalareDeunaParser } from "./ondarroa-kalaredeuna";
import { getariaElkanoParser } from "./getaria-elkano";
import { hondarribiaSanPedroParser } from "./hondarribia-sanpedro";
import { bermeoSanPedroParser } from "./bermeo-sanpedro";

/** Registry de parsers disponibles. Ampliar aquí al añadir un nuevo puerto. */
export const registry: Record<string, ParserHandler> = {
  [laredoSanMartinParser.key]: laredoSanMartinParser,
  [santonaDelPuertoParser.key]: santonaDelPuertoParser,
  [ondarroaKalareDeunaParser.key]: ondarroaKalareDeunaParser,
  [getariaElkanoParser.key]: getariaElkanoParser,
  [hondarribiaSanPedroParser.key]: hondarribiaSanPedroParser,
  [bermeoSanPedroParser.key]: bermeoSanPedroParser,
  [genericParser.key]: genericParser
};

export {
  genericParser,
  laredoSanMartinParser,
  santonaDelPuertoParser,
  ondarroaKalareDeunaParser,
  getariaElkanoParser,
  hondarribiaSanPedroParser,
  bermeoSanPedroParser
};
export * from "./base";
