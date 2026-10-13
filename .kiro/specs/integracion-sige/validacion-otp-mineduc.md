# Anexo — Validación de firma OTP Mineduc (API EDE)

> **FUTURO / fuera del MVP de matrícula.** Se implementa solo con convenio y credenciales
> institucionales de Mineduc. No forma parte de la importación/conciliación SIGE de la primera
> versión. Se documenta aquí para dejar el contrato listo. **No versionar ningún secreto, token
> ni clave privada.**

## Propósito
Permitir validar la firma (clave OTP) de los docentes/responsables en el futuro libro de clases
digital, contra la API oficial de Mineduc (`apiede.mineduc.cl`). Dos modos: transaccional (en
línea, una firma) y masivo (lote de firmas).

## 1. Validación transaccional (GET)

```
GET https://apiede.mineduc.cl/otp/verify-otp?rut=@!rut&otp=@@qrcode&DateWithTimeZone=@@DateWithTimeZone
```

Parámetros:
- `rut`: RUN con guion y dígito verificador (ej. `14206906-3`).
- `otp` (`qrcode`): clave aleatoria digital (ej. `123456`).
- `DateWithTimeZone`: fecha con zona horaria ISO-8601 (ej. `2019-04-26T15:46:45-04:00`).

Respuesta: JSON con indicador booleano del resultado.

Casos de referencia observados:
- RUT inexistente → respuesta de "RUT no existe".
- Body inválido (ej. `rut=1-9`) → "Invalid request body".
- OTP incorrecto → verificación `false`.

## 2. Validación masiva (POST)

```
POST https://apiede.mineduc.cl/otp/verify-otp
Content-Type: application/json
```

Body: lista de objetos `{RUT, OTP, TIMESTAMP}`:
```json
[
  {"RUT":"44444444-4","OTP":"968017","TIMESTAMP":"2019-04-26T15:46:25-04:00"},
  {"RUT":"99999999-9","OTP":"968017","TIMESTAMP":"2019-04-26T15:46:25-04:00"}
]
```
Donde:
- `RUT`: RUN con guion y dígito verificador.
- `OTP`: clave aleatoria digital.
- `TIMESTAMP`: fecha con zona horaria (ej. `2019-04-26T15:46:45-04:00`).

Respuesta: JSON con, por cada RUT, un indicador booleano del resultado.

## 3. Seguridad (clave pública RSA)
Mineduc entrega una **clave pública** RSA para la verificación. Guardar como configuración
institucional (NO en el repositorio). Valor de referencia entregado por el proveedor
(solo para integración, verificar que siga vigente):

```
-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAxfLqdKTtAFwh8lPf/sjE
6N3rPZqyjHNYglGQRPJ6sHHs0Ciw18v8R4eVEIwdGslFDvg3usP1PMQrW9Nyy16S
z4T5lUyPTZFgvQ0xyB1HH9gqyprxV7Rcdb5iRLj3HuUG8Bg/4mWvp5I69GpZcpPF
wm0T7Y8Np1ouErf6f+Yp6c4X0JQ5Cm8EIGmom0mRw93uouYXZ+P8WMd/EEdgRl8v
Jpgkewt99lm5SPsW3742bgfnsT38Z2vJMziXtVIPVsdH5yKGe0arAYIY6UHC+JnO
S/KjBZ609Px5Z785ZrppXiVEX0K4e294S5xhpzPuNLTAsYPfLWDjwaLZGN8hGvFS
CwIDAQAB
-----END PUBLIC KEY-----
```

> Esta es una clave **pública** (puede residir en configuración). Cualquier token, API key o
> credencial privada asociada al convenio NO debe commitearse; va como secreto de entorno
> (patrón de `backend/.env` + `config.py`, como el resto del sistema).

## 4. Encaje en el RGM (cuando se implemente)
- Nuevo servicio `services/otp_mineduc_service.py` que llame a la API (transaccional/masivo).
- Nunca enviar más datos personales de los estrictos (RUT/OTP/timestamp).
- Registrar resultado de verificación en auditoría, sin almacenar el OTP.
- Desacoplado del importador SIGE: es validación de firma del libro digital, no de matrícula.
- Alinea con el flujo de firma ya existente del RGM (SIMPLE + Clave Única, steering 05), pero es
  un canal distinto (API EDE de Mineduc).

## 5. Pendientes antes de implementar
- Confirmar vigencia de la URL, el contrato y la clave pública con Mineduc (los ejemplos son de
  2019).
- Obtener convenio/credenciales institucionales.
- Definir qué entidad del libro digital consume la verificación (firma de registro de asistencia,
  cierre de libro, etc.).
