import { crearServicioCrud } from "./crud";

const crud = crearServicioCrud("/transferencias-marcos");

// El backend no permite editar ni anular transferencias: solo listar y registrar.
export const transferenciasService = {
  listar: crud.listar,
  obtener: crud.obtener,
  crear: crud.crear,
};
