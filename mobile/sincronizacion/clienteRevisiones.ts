import { solicitarAPI } from '../api/cliente';

export type EstadoColmenaRemota =
  'PENDIENTE' | 'REVISADA' | 'OMITIDA';

export type SesionRevisionRemota = {
  id: number;
  grupo_id: number;
  usuario_id: number;
  id_cliente: string | null;
  estado: 'EN_CURSO' | 'FINALIZADA';
  progreso: {
    total: number;
    revisadas: number;
    omitidas: number;
    pendientes: number;
  };
  colmenas: Array<{
    colmena_id: number;
    estado: EstadoColmenaRemota;
    inspeccion_id: number | null;
    motivo_omision: string | null;
  }>;
};

function validarId(id: number): void {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error('Identificador remoto invalido.');
  }
}

function validarToken(token: string): void {
  if (!token.trim()) {
    throw new Error('Falta el token de autenticacion.');
  }
}

export async function crearSesionRemota(
  grupoId: number,
  idCliente: string,
  token: string
): Promise<SesionRevisionRemota> {
  validarId(grupoId);
  validarToken(token);

  if (!idCliente.trim()) {
    throw new Error('Falta el UUID de la revision.');
  }

  return solicitarAPI<SesionRevisionRemota>(
    '/revisiones/',
    {
      method: 'POST',
      token,
      body: {
        grupo_id: grupoId,
        id_cliente: idCliente,
      },
    }
  );
}

export async function consultarSesionRemota(
  sesionId: number,
  token: string
): Promise<SesionRevisionRemota> {
  validarId(sesionId);
  validarToken(token);

  return solicitarAPI<SesionRevisionRemota>(
    `/revisiones/${sesionId}`,
    { method: 'GET', token }
  );
}

export async function omitirColmenaRemota(
  sesionId: number,
  colmenaId: number,
  motivo: string | null,
  token: string
): Promise<SesionRevisionRemota> {
  validarId(sesionId);
  validarId(colmenaId);
  validarToken(token);

  return solicitarAPI<SesionRevisionRemota>(
    `/revisiones/${sesionId}/omitir`,
    {
      method: 'POST',
      token,
      body: {
        colmena_id: colmenaId,
        motivo,
      },
    }
  );
}

export async function finalizarSesionRemota(
  sesionId: number,
  token: string
): Promise<SesionRevisionRemota> {
  validarId(sesionId);
  validarToken(token);

  return solicitarAPI<SesionRevisionRemota>(
    `/revisiones/${sesionId}/finalizar`,
    {
      method: 'POST',
      token,
    }
  );
}
