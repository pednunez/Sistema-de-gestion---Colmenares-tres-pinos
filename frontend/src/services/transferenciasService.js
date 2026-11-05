import { crearServicioCrud } from "./crud";

const crud = crearServicioCrud("/transferencias-marcos");

// Solo lectura en el frontend. Las transferencias las crea el backend al
// guardar la inspección (marcos[].transferido_a_colmena_id) y no se editan ni anulan.
export const transferenciasService = {
  listar: crud.listar,
  obtener: crud.obtener,
};
