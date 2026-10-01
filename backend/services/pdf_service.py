import io
import os
import textwrap
from datetime import datetime
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import letter
from config import FRONTEND_URL

# --- FUNCIÓN MEJORADA: SOPORTA TEXTOS LARGOS (MULTILÍNEA) ---
def dibujar_seccion_tabla(c, x, y_inicial, width, filas):
    """
    Dibuja una gran caja contenedora donde las filas se ajustan 
    automáticamente si el texto es muy largo (como direcciones extensas).
    """
    ancho_etiqueta = 140
    ancho_valor = width - ancho_etiqueta
    margen_texto = 8
    
    # 1. Pre-calcular las alturas de cada fila evaluando el texto largo
    filas_procesadas = []
    altura_total = 0
    
    for label, value in filas:
        val_str = str(value)
        # Envolvemos el texto según el ancho disponible en la columna de la derecha
        lineas_valor = textwrap.wrap(val_str, width=65) if len(val_str) > 50 else [val_str]
        if not lineas_valor: 
            lineas_valor = [""]
            
        # Cada línea ocupa 12 puntos de alto; aseguramos un mínimo de 18 por fila
        alto_fila = max(18, len(lineas_valor) * 12 + 6)
        filas_procesadas.append((label, lineas_valor, alto_fila))
        altura_total += alto_fila

    y_final = y_inicial - altura_total

    c.saveState()
    c.setStrokeColorRGB(0.6, 0.6, 0.6) # Color del borde exterior
    c.setLineWidth(0.75)

    # 2. Dibujar el recuadro exterior grande de la sección
    c.rect(x, y_final, width, altura_total)

    # 3. Dibujar las celdas, textos y líneas divisorias
    y_actual = y_inicial
    for label, lineas_valor, alto_fila in filas_procesadas:
        y_actual -= alto_fila
        
        # Línea horizontal interna
        c.line(x, y_actual, x + width, y_actual)

        # Línea divisoria vertical (separa etiqueta y valor)
        c.line(x + ancho_etiqueta, y_actual, x + ancho_etiqueta, y_actual + alto_fila)

        # Escribir la Etiqueta centrada verticalmente en la celda
        c.setFont("Helvetica-Bold", 8.5)
        c.setFillColorRGB(0.2, 0.2, 0.2)
        c.drawString(x + margen_texto, y_actual + (alto_fila / 2.5), label)

        # Escribir el Valor (soporta múltiples líneas si la dirección es muy larga)
        c.setFont("Helvetica", 8.5)
        c.setFillColorRGB(0, 0, 0)
        
        y_texto = y_actual + alto_fila - 11 # Posición inicial para la primera línea
        for linea in lineas_valor:
            c.drawString(x + ancho_etiqueta + margen_texto, y_texto, linea)
            y_texto -= 11 # Espaciado vertical entre líneas del mismo párrafo

    c.restoreState()
    return y_final

def generar_certificado_pdf(datos: dict, tipo_documento: str, codigo_verificacion: str = None):
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=letter)
    width, height = letter

    # Rutas de Imágenes
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ruta_mineduc = os.path.join(base_dir, "static", "mineduc.monocromo.png")   # Logo oficial monocromo Mineduc
    ruta_slep = os.path.join(base_dir, "static", "logo-slep.negro.png")
    ruta_marca_agua = os.path.join(base_dir, "static", "logo-slep.negro.opaco.png")

    # Marca de Agua
    if os.path.exists(ruta_marca_agua):
        img_width = 450
        img_height = 225
        c.saveState()
        c.setFillColorRGB(0.95, 0.95, 0.95)
        c.drawImage(ruta_marca_agua, (width - img_width) / 2.0, (height - img_height) / 2.0 - 40, width=img_width, height=img_height, mask='auto')
        c.restoreState()
    elif os.path.exists(ruta_slep):
        c.saveState()
        c.drawImage(ruta_slep, (width - 350) / 2.0, (height - 175) / 2.0 + 30, width=350, height=175, mask='auto')
        c.restoreState()

    # Logo Mineduc
    if os.path.exists(ruta_mineduc):
        c.drawImage(ruta_mineduc, 60, height - 85, width=60, height=60, mask='auto')

    # Extracción de Variables
    anio_escolar = datos.get('anio', datetime.now().year)
    nombre_colegio = str(datos.get('nombre_colegio', 'ESTABLECIMIENTO')).split('(')[0].strip().upper()
    nombre_alumno = datos.get('nombre_completo', '').upper()
    rut_alumno = datos.get('rut', '').upper()
    curso = datos.get('curso', '').upper()
    domicilio = str(datos.get('domicilio', '')).upper()
    nombre_apoderado = datos.get('nombre_apoderado', '').upper()
    rut_apoderado = datos.get('rut_apoderado', '').upper()
    
    fecha_nacimiento = datos.get('fecha_nacimiento', '')
    telefono_apoderado = datos.get('telefono_apoderado', '')
    correo_apoderado = datos.get('correo_apoderado', '')
    rbd_colegio = datos.get('rbd_colegio', '')
    
    hoy = datetime.now()
    fecha_str = hoy.strftime('%d/%m/%Y a las %H:%M:%S hrs.')
    fecha_matricula_str = str(datos.get('fecha_matricula', hoy.strftime('%Y-%m-%d')))
    usuario_ejecutor = str(datos.get('usuario_ejecutor', 'Sistema RGM')).upper()

    if tipo_documento == 'COMPROBANTE_INGRESO':
        # --- TÍTULOS SUPERIORES (Con mayor tamaño y separación) ---
        titulo_pdf = f"COMPROBANTE MATRÍCULA PARA EL AÑO ESCOLAR {anio_escolar}"

        espacio_inicio = 135
        espacio_fin = width - 60
        centro_ajustado = espacio_inicio + ((espacio_fin - espacio_inicio) / 2.0)
        
        c.setFont("Helvetica-Bold", 15)  # Aumentado de 13 a 15
        c.setFillColorRGB(0, 0, 0)
        c.drawCentredString(centro_ajustado, height - 55, titulo_pdf)
        
        # Nombre del establecimiento más grande y ubicado debajo del título
        c.setFont("Helvetica-Bold", 12.5)  # Aumentado de 11 a 12.5
        c.setFillColorRGB(0.2, 0.3, 0.6)
        c.drawCentredString(centro_ajustado, height - 75, nombre_colegio)
        
        # Bajamos el punto de partida de las tablas para dar más espacio arriba
        y_pos = height - 115  
        margen_izq = 60
        ancho_tabla = width - 120

        # --- BLOQUE 1: DATOS DEL ESTUDIANTE ---
        c.setFont("Helvetica-Bold", 10.5)  # Subtítulo de sección más grande
        c.setFillColorRGB(0.1, 0.2, 0.4)
        c.drawString(margen_izq, y_pos, "DATOS DEL ESTUDIANTE")
        y_pos -= 14

        filas_estudiante = [
            ("Nombre completo", nombre_alumno),
            ("RUN/IPE", rut_alumno),
            ("Fecha de nacimiento", fecha_nacimiento),
            (f"Curso {anio_escolar}", curso),
            ("Domicilio", domicilio)
        ]
        y_pos = dibujar_seccion_tabla(c, margen_izq, y_pos, ancho_tabla, filas_estudiante)
        y_pos -= 16

        # --- BLOQUE 2: DATOS DEL APODERADO ---
        c.setFont("Helvetica-Bold", 10.5)
        c.setFillColorRGB(0.1, 0.2, 0.4)
        c.drawString(margen_izq, y_pos, "DATOS DEL APODERADO")
        y_pos -= 14

        filas_apoderado = [
            ("Nombre completo", nombre_apoderado),
            ("RUN/IPA", rut_apoderado),
            ("Teléfono", telefono_apoderado),
            ("Email", correo_apoderado)
        ]
        y_pos = dibujar_seccion_tabla(c, margen_izq, y_pos, ancho_tabla, filas_apoderado)
        y_pos -= 10

        # Disclaimer Apoderado
        c.setFont("Helvetica-Oblique", 8.5)  # Letra más legible
        c.setFillColorRGB(0.4, 0.4, 0.4)
        texto_apoderado = "El apoderado(a) ha declarado recibir, conocer y aceptar el proyecto educativo, reglamentos, protocolos y otros documentos oficiales del establecimiento."
        for linea in textwrap.wrap(texto_apoderado, width=110):
            c.drawString(margen_izq, y_pos, linea)
            y_pos -= 11
            
        y_pos -= 12

        # --- BLOQUE 3: DATOS DEL ESTABLECIMIENTO EDUCATIVO ---
        c.setFont("Helvetica-Bold", 10.5)
        c.setFillColorRGB(0.1, 0.2, 0.4)
        c.drawString(margen_izq, y_pos, "DATOS DEL ESTABLECIMIENTO EDUCATIVO")
        y_pos -= 14

        filas_establecimiento = [
            ("Nombre", nombre_colegio),
            ("RBD", rbd_colegio),
            ("Fecha de matrícula", fecha_matricula_str),
            ("Matriculado por", usuario_ejecutor)
        ]
        y_pos = dibujar_seccion_tabla(c, margen_izq, y_pos, ancho_tabla, filas_establecimiento)
        y_pos -= 16

        # Disclaimer Legal Final
        c.setFont("Helvetica", 8.5)
        c.setFillColorRGB(0.3, 0.3, 0.3)
        texto_legal = "Este comprobante es de uso interno y se entrega en conformidad de lo establecido en el artículo 53 inciso 1 del Decreto Exento N° 152 año 2016, del Ministerio de Educación y acredita la matrícula del estudiante individualizado."
        for linea in textwrap.wrap(texto_legal, width=110):
            c.drawString(margen_izq, y_pos, linea)
            y_pos -= 12
            
    else:
        # --- DISEÑO CLÁSICO DE CARTA FORMAL (Para Retiros y Traslados) ---
        if tipo_documento == 'RETIRO':
            titulo_pdf = f"CERTIFICADO DE RETIRO ESCOLAR"
        elif tipo_documento == 'CAMBIO_CURSO':
            titulo_pdf = f"COMPROBANTE DE TRASLADO DE CURSO"
        else:
            titulo_pdf = f"CERTIFICADO DE MATRÍCULA"

        c.setFont("Times-Bold", 16)
        c.setFillColorRGB(0, 0, 0)
        c.drawCentredString(width / 2.0, height - 120, titulo_pdf)

        c.setFont("Times-Bold", 11)
        c.setFillColorRGB(0.3, 0.3, 0.3)
        c.drawCentredString(width / 2.0, height - 140, f"{nombre_colegio} ")
        c.setFillColorRGB(0, 0, 0)

        c.setFont("Times-Roman", 11)
        
        if tipo_documento == 'RETIRO':
            texto_principal = f"Certifico que el niño (a) / alumno (a): {nombre_alumno}, Rut: {rut_alumno}, domiciliado en {domicilio}, ha sido RETIRADO (A) del curso {curso} para el año {anio_escolar} del {nombre_colegio}; dependiente del Servicio Local de Educación Pública Valparaíso."
        elif tipo_documento == 'CAMBIO_CURSO':
            texto_principal = f"Certifico que el niño (a) / alumno (a): {nombre_alumno}, Rut: {rut_alumno}, domiciliado en {domicilio}, ha sido TRASLADADO (A) de curso exitosamente hacia el {curso} para el año {anio_escolar} del {nombre_colegio}; dependiente del Servicio Local de Educación Pública Valparaíso."
        else:
            texto_principal = f"Certifico que el niño (a) / alumno (a): {nombre_alumno}, Rut: {rut_alumno}, domiciliado en {domicilio}, es Alumno (a) Regular matriculado para el año {anio_escolar} en el curso {curso} del {nombre_colegio}; dependiente del Servicio Local de Educación Pública Valparaíso."

        texto_footer = f"Se extiende el presente certificado a petición de la parte interesada, dejando constancia oficial de que el registro se encuentra activo y validado en el sistema del establecimiento a fecha {fecha_str}, trámite validado junto al Apoderado (a) titular: {nombre_apoderado}, Rut: {rut_apoderado}, para los fines que estime conveniente."

        y_pos = height - 200
        for linea in textwrap.wrap(texto_principal, width=95):
            c.drawString(60, y_pos, linea)
            y_pos -= 16
            
        y_pos -= 20 
        
        for linea in textwrap.wrap(texto_footer, width=95):
            c.drawString(60, y_pos, linea)
            y_pos -= 16

        c.setFont("Times-Bold", 9)
        c.drawCentredString(width / 2.0, 200, "___________________________________")
        c.drawCentredString(width / 2.0, 185, "TIMBRE Y FIRMA DIRECCIÓN")

    # ==========================================
    # SECCIÓN INFERIOR: LOGO SLEP + VERIFICACIÓN
    # ==========================================
    if codigo_verificacion:
        c.setStrokeColorRGB(0.6, 0.6, 0.6)
        c.setLineWidth(1)
        c.line(50, 115, width - 50, 115)
        
        if os.path.exists(ruta_slep):
            c.drawImage(ruta_slep, 50, 72, width=60, height=30, mask='auto')
        
        c.setFont("Helvetica-Bold", 6.5)
        c.setFillColorRGB(0, 0, 0)
        c.drawString(50, 62, "https://www.slepvalparaiso.gob.cl/")
        c.setFont("Helvetica", 6.5)
        c.drawString(50, 52, "Blanco 937, 2° piso, Valparaíso")

        c.setFont("Helvetica-Bold", 8)
        c.drawString(320, 92, "VERIFICACIÓN DE AUTENTICIDAD DOCUMENTAL")
        
        c.setFont("Helvetica", 8)
        c.drawString(320, 82, f"Código de Verificación Único: {codigo_verificacion}")
        c.drawString(320, 72, f"Verifique la validez de este certificado ingresando a: {FRONTEND_URL}/verificar")
        c.drawString(320, 62, "e ingresando el código proporcionado junto al RUT del estudiante.")

    c.save()
    buffer.seek(0)
    return buffer, titulo_pdf