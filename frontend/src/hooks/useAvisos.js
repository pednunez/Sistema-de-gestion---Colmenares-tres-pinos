import { useContext } from "react";
import { AvisosContext } from "../context/contextos";

export function useAvisos() {
  return useContext(AvisosContext);
}
