import { useContext } from "react";
import { DatosContext } from "../context/contextos";

export function useDatos() {
  return useContext(DatosContext);
}
