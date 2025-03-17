# POS Project Integration

Este módulo integra el Punto de Venta (POS) de Odoo con el módulo de Proyectos, permitiendo crear automáticamente tarjetas (tareas) en proyectos desde las órdenes del POS.

## Características

- Configuración sencilla: selecciona un proyecto donde se crearán las tarjetas
- Creación automática de tarjetas al finalizar una venta en el POS
- Botón en la interfaz del POS para crear tarjetas manualmente
- Información detallada en las tarjetas: productos, cantidades, cliente, notas, etc.

## Configuración

1. Instala el módulo
2. Ve a Punto de Venta > Configuración > Terminales de Punto de Venta
3. Selecciona la terminal que deseas configurar
4. En la sección "Integración con Proyectos", activa la opción "Activar Integración con Proyectos"
5. Selecciona el proyecto donde se crearán las tarjetas

## Uso

### Creación automática de tarjetas

Cuando se finaliza una venta en el POS, se crea automáticamente una tarjeta en el proyecto configurado con la información de la orden.

### Creación manual de tarjetas

También puedes crear tarjetas manualmente desde el POS utilizando el botón "Crear Tarea" que aparece en la interfaz.

## Información técnica

Este módulo está basado en la funcionalidad de "Preparation Printers" de Odoo, pero en lugar de imprimir órdenes, crea tarjetas en proyectos.

### Dependencias

- point_of_sale
- project

### Compatibilidad

Este módulo es compatible con Odoo 18.

### Autores

- Daril
- Claude "# pos_project_integration" 
