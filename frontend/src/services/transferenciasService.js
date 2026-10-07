import { crearServicioCrud } from "./crud";

const crud = crearServicioCrud("/transferencias-marcos");

// El backend no permite editar ni anular transferencias. Se registran desde la
// inspección; el módulo Transferencias solo las lista.
export const transferenciasService = {
  listar: crud.listar,
  obtener: crud.obtener,
  crear: crud.crear,
};
