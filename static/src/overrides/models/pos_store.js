/** @odoo-module */

import { PosStore } from "@point_of_sale/app/store/pos_store";
import { ProjectTaskCreator } from "@pos_project_integration/app/project_task_creator";
import { patch } from "@web/core/utils/patch";
import { _t } from "@web/core/l10n/translation";
import { rpc } from "@web/core/network/rpc";

patch(PosStore.prototype, {
    setup() {
        super.setup(...arguments);
        this.projectTaskCreator = null;
    },

    async afterLoad() {
        await super.afterLoad(...arguments);
        if (this.config.enable_project_integration && this.config.project_id) {
            this.projectTaskCreator = new ProjectTaskCreator(this);
        }
    },

    async _finalizeValidation(order) {
        await super._finalizeValidation(...arguments);
        
        // Si la orden tiene un ID de backend y la integración está habilitada, crear la tarea
        if (order.backendId && this.projectTaskCreator) {
            try {
                const result = await this.projectTaskCreator.createTask(order);
                if (result.success) {
                    this.notification.add(_t("Tarea creada correctamente"), { type: "success" });
                } else {
                    this.notification.add(result.message, { type: "warning" });
                }
            } catch (error) {
                this.notification.add(_t("Error al crear la tarea"), { type: "danger" });
                console.error("Error al crear la tarea:", error);
            }
        }
    },

    create_printer(config) {
        if (config.printer_type === "project") {
            const self = this;
            
            console.log("Creando impresora de tipo proyecto con config:", config);
            console.log("Datos completos de la impresora:", JSON.stringify(config));
            
            // Verificar que el proyecto esté configurado
            const projectId = config.project_id;
            if (!projectId) {
                console.error("No hay proyecto configurado en la impresora:", config);
                this.notification.add(_t("La impresora de tipo proyecto no tiene un proyecto configurado. Por favor, configure un proyecto en la impresora."), { type: "danger" });
                
                // Crear una impresora ficticia que muestre un mensaje de error
                return {
                    connection: { isOpen: true },
                    printReceipt: function() {
                        self.notification.add(_t("No se puede imprimir: la impresora no tiene un proyecto configurado"), { type: "danger" });
                        return Promise.resolve(false);
                    },
                    printPackingReceipt: function() {
                        self.notification.add(_t("No se puede imprimir: la impresora no tiene un proyecto configurado"), { type: "danger" });
                        return Promise.resolve(false);
                    },
                    printChanges: function() {
                        self.notification.add(_t("No se puede imprimir: la impresora no tiene un proyecto configurado"), { type: "danger" });
                        return Promise.resolve(false);
                    },
                    print: function() {
                        self.notification.add(_t("No se puede imprimir: la impresora no tiene un proyecto configurado"), { type: "danger" });
                        return Promise.resolve(false);
                    },
                    isConnected: function() {
                        return false;
                    },
                    openCashbox: function() {
                        return Promise.resolve(false);
                    },
                    send_printing_job: function() {
                        return Promise.resolve(false);
                    },
                    print_receipt: function() {
                        return Promise.resolve(false);
                    },
                    print_status: function() {
                        return { status: 'disconnected', messages: [_t("No hay proyecto configurado")] };
                    }
                };
            }
            
            // Crear un manejador especial para impresoras de tipo proyecto
            return {
                connection: { isOpen: true },
                
                // Función principal para crear la tarea
                async createProjectTask(receipt) {
                    if (!receipt) return false;
                    
                    try {
                        console.log("Creando tarea de proyecto para recibo:", receipt);
                        
                        // Obtener el ID del proyecto
                        let projectIdValue;
                        if (typeof projectId === 'object' && projectId !== null && projectId.id) {
                            projectIdValue = projectId.id;
                        } else if (typeof projectId === 'number') {
                            projectIdValue = projectId;
                        } else {
                            console.error("Formato de project_id no reconocido:", projectId);
                            self.notification.add(_t("Formato de project_id no reconocido"), { type: "danger" });
                            return false;
                        }
                        
                        console.log("Project ID a utilizar:", projectIdValue);
                        
                        // Preparar los datos de la orden para enviar al servidor
                        const orderData = {
                            project_id: projectIdValue,
                            order_lines: [],
                            note: '',
                            name: '',
                            is_change_order: false,
                            is_new_order: true, // Marcar como nueva orden por defecto
                            is_added_order: false, // Por defecto no es un pedido agregado
                            table: null,
                            server: null,
                            reprint: true // Marcar como reimpresión para procesar toda la orden
                        };
                        
                        // Obtener la orden actual completa
                        const order = self.get_order();
                        if (order) {
                            console.log("Obteniendo datos completos de la orden actual:", order);
                            
                            try {
                                // Intentar obtener el cliente
                                if (typeof order.get_client === 'function' && order.get_client()) {
                                    orderData.customer = {
                                        id: order.get_client().id,
                                        name: order.get_client().name
                                    };
                                }
                                
                                // Intentar obtener información de mesa
                                if (typeof order.get_table === 'function' && order.get_table()) {
                                    const table = order.get_table();
                                    orderData.table = table.name || `Mesa ${table.id}`;
                                    console.log("Mesa obtenida de get_table():", orderData.table);
                                } else if (order.table) {
                                    orderData.table = order.table.name || `Mesa ${order.table.id}`;
                                    console.log("Mesa obtenida de order.table:", orderData.table);
                                }
                                
                                // Intentar obtener información de camarero
                                if (typeof order.get_server === 'function' && order.get_server()) {
                                    const server = order.get_server();
                                    orderData.server = server.name || server;
                                    console.log("Camarero obtenido de get_server():", orderData.server);
                                } else if (order.server) {
                                    orderData.server = order.server.name || order.server;
                                    console.log("Camarero obtenido de order.server:", orderData.server);
                                } else if (typeof order.get_cashier === 'function' && order.get_cashier()) {
                                    const cashier = order.get_cashier();
                                    orderData.server = cashier.name || cashier;
                                    console.log("Camarero obtenido de get_cashier():", orderData.server);
                                } else if (self.get_cashier()) {
                                    const cashier = self.get_cashier();
                                    orderData.server = cashier.name || cashier.user_name || `Usuario ${cashier.id}`;
                                    console.log("Camarero obtenido de PosStore.get_cashier():", orderData.server);
                                }
                                
                                // Generar nombre de orden con formato "Order XXXXX-XXX-XXXX"
                                if (order.name) {
                                    // Intentar extraer el formato "Order XXXXX-XXX-XXXX"
                                    const orderNameMatch = order.name.match(/Order\s+(\d+-\d+-\d+)/i);
                                    if (orderNameMatch && orderNameMatch[1]) {
                                        orderData.name = `Order ${orderNameMatch[1]}`;
                                        if (receipt.data && receipt.data.reprint) {
                                            orderData.name += " (Reimpresión)";
                                        }
                                        console.log("Nombre de orden extraído con formato Order XXXXX-XXX-XXXX:", orderData.name);
                                    } else {
                                        // Crear un nuevo formato basado en la fecha y hora actual
                                        const now = new Date();
                                        const dateStr = now.getFullYear().toString().substr(-2) + 
                                                      (now.getMonth() + 1).toString().padStart(2, '0') + 
                                                      now.getDate().toString().padStart(2, '0');
                                        const timeStr = now.getHours().toString().padStart(2, '0') + 
                                                      now.getMinutes().toString().padStart(2, '0');
                                        const randomNum = Math.floor(1000 + Math.random() * 9000);
                                        
                                        orderData.name = `Order ${dateStr}-${timeStr}-${randomNum}`;
                                        if (receipt.data && receipt.data.reprint) {
                                            orderData.name += " (Reimpresión)";
                                        }
                                        console.log("Nombre de orden generado con nuevo formato:", orderData.name);
                                    }
                                } else {
                                    // Crear un nuevo formato basado en la fecha y hora actual
                                    const now = new Date();
                                    const dateStr = now.getFullYear().toString().substr(-2) + 
                                                  (now.getMonth() + 1).toString().padStart(2, '0') + 
                                                  now.getDate().toString().padStart(2, '0');
                                    const timeStr = now.getHours().toString().padStart(2, '0') + 
                                                  now.getMinutes().toString().padStart(2, '0');
                                    const randomNum = Math.floor(1000 + Math.random() * 9000);
                                    
                                    orderData.name = `Order ${dateStr}-${timeStr}-${randomNum}`;
                                    if (receipt.data && receipt.data.reprint) {
                                        orderData.name += " (Reimpresión)";
                                    }
                                    console.log("Nombre de orden generado con nuevo formato (sin nombre original):", orderData.name);
                                }
                                
                                // Intentar obtener la nota general de la orden
                                if (typeof order.get_note === 'function') {
                                    const note = order.get_note();
                                    if (note && note.trim() !== '') {
                                        orderData.note = note;
                                        console.log("Nota general obtenida con get_note():", orderData.note);
                                    }
                                } else if (order.note) {
                                    orderData.note = order.note;
                                    console.log("Nota general obtenida de order.note:", orderData.note);
                                }
                                
                                // Obtener todas las líneas de la orden actual
                                if (typeof order.get_orderlines === 'function') {
                                    const orderlines = order.get_orderlines();
                                    console.log("Líneas de orden encontradas:", orderlines.length);
                                    
                                    orderData.order_lines = [];
                                    for (const line of orderlines) {
                                        // Verificar que la cantidad sea positiva
                                        let quantity = 0;
                                        if (typeof line.get_quantity === 'function') {
                                            quantity = line.get_quantity();
                                        } else if (line.qty) {
                                            quantity = line.qty;
                                        } else if (line.quantity) {
                                            quantity = line.quantity;
                                        }
                                        
                                        if (quantity <= 0) {
                                            console.log("Omitiendo línea con cantidad <= 0");
                                            continue;
                                        }
                                        
                                        console.log("Procesando línea:", line);
                                        
                                        // Obtener la nota del producto
                                        let note = '';
                                        if (typeof line.get_note === 'function') {
                                            note = line.get_note() || '';
                                            console.log("Nota obtenida con get_note():", note);
                                        } else if (line.note) {
                                            note = line.note;
                                            console.log("Nota obtenida de line.note:", note);
                                        } else if (line.customer_note) {
                                            note = line.customer_note;
                                            console.log("Nota obtenida de line.customer_note:", note);
                                        } else if (line.client_note) {
                                            note = line.client_note;
                                            console.log("Nota obtenida de line.client_note:", note);
                                        } else if (line.comment) {
                                            note = line.comment;
                                            console.log("Nota obtenida de line.comment:", note);
                                        }
                                        
                                        // Obtener sides/extras si existen
                                        let sides = [];
                                        if (line.get_sides && typeof line.get_sides === 'function') {
                                            sides = line.get_sides() || [];
                                            console.log("Sides obtenidos con get_sides():", sides);
                                        } else if (line.sides) {
                                            sides = line.sides;
                                            console.log("Sides obtenidos de line.sides:", sides);
                                        }
                                        
                                        // Obtener atributos de combo si existen
                                        let comboItems = [];
                                        if (line.get_combo_items && typeof line.get_combo_items === 'function') {
                                            comboItems = line.get_combo_items() || [];
                                            console.log("Combo items obtenidos con get_combo_items():", comboItems);
                                        } else if (line.combo_items) {
                                            comboItems = line.combo_items;
                                            console.log("Combo items obtenidos de line.combo_items:", comboItems);
                                        }
                                        
                                        // Intentar obtener el producto directamente o a través de métodos
                                        let productId, productName, price;
                                        
                                        if (typeof line.get_product === 'function' && line.get_product()) {
                                            const product = line.get_product();
                                            productId = product.id;
                                            productName = product.display_name || product.name;
                                            console.log("Producto obtenido con get_product():", productName);
                                        } else if (line.product_id) {
                                            productId = line.product_id;
                                            productName = line.product_name || line.name || "Producto sin nombre";
                                            console.log("Producto obtenido de line.product_id:", productName);
                                        }
                                        
                                        // Obtener precio
                                        if (typeof line.get_price_with_tax === 'function') {
                                            price = line.get_price_with_tax();
                                            console.log("Precio obtenido con get_price_with_tax():", price);
                                        } else if (line.price_with_tax) {
                                            price = line.price_with_tax;
                                            console.log("Precio obtenido de line.price_with_tax:", price);
                                        } else if (line.price) {
                                            price = line.price;
                                            console.log("Precio obtenido de line.price:", price);
                                        } else {
                                            price = 0;
                                            console.log("No se pudo obtener el precio, usando 0");
                                        }
                                        
                                        // Procesar sides/extras
                                        let sidesToAdd = this._processSides(sides);
                                        
                                        // Procesar atributos de combo
                                        let comboInfo = this._processComboItems(comboItems);
                                        
                                        // Combinar nota original con sides y combo info
                                        let fullNote = note;
                                        if (sidesToAdd) {
                                            fullNote += (fullNote ? '\n' : '') + 'Extras: ' + sidesToAdd;
                                        }
                                        if (comboInfo) {
                                            fullNote += (fullNote ? '\n' : '') + 'Combo: ' + comboInfo;
                                        }
                                        
                                        console.log("Nota final para el producto:", fullNote);
                                        
                                        // Verificar si hay atributos en el nombre del producto
                                        let fullProductName = productName;
                                        
                                        // Intentar extraer atributos del nombre del producto si están entre paréntesis
                                        const attributesInName = this._extractAttributesFromName(productName);
                                        if (attributesInName) {
                                            console.log("Atributos encontrados en el nombre del producto:", attributesInName);
                                        }
                                        
                                        // Intentar obtener atributos del producto
                                        const productAttributes = this._getProductAttributes(line);
                                        if (productAttributes && productAttributes.length > 0) {
                                            console.log("Atributos obtenidos del producto:", productAttributes);
                                            // Añadir atributos al nombre del producto si no están ya incluidos
                                            if (!attributesInName) {
                                                fullProductName = `${productName} (${productAttributes.join(', ')})`;
                                            }
                                        }
                                        
                                        orderData.order_lines.push({
                                            product_id: productId,
                                            product_name: fullProductName,
                                            qty: quantity,
                                            note: fullNote,
                                            price: price,
                                            sides: sides,
                                            combo_items: comboItems,
                                            attributes: productAttributes || []
                                        });
                                    }
                                    
                                    console.log("Líneas de orden procesadas:", orderData.order_lines.length);
                                }
                            } catch (e) {
                                console.error("Error al obtener datos completos de la orden:", e);
                            }
                        }
                        
                        // Si no hay líneas de orden, intentar obtenerlas del recibo
                        if (orderData.order_lines.length === 0 && receipt.data) {
                            console.log("No se obtuvieron líneas de la orden actual, intentando obtenerlas del recibo");
                            
                            // Extraer información del recibo
                            if (receipt.data.orderlines) {
                                // Procesar todas las líneas del recibo
                                this._processOrderLines(receipt.data.orderlines, orderData.order_lines);
                            }
                            
                            // Extraer información del cliente si está disponible
                            if (receipt.data.client) {
                                orderData.customer = {
                                    id: receipt.data.client.id,
                                    name: receipt.data.client.name
                                };
                            }
                            
                            // Extraer información de mesa si está disponible
                            this._extractTableInfo(receipt.data, orderData);
                            
                            // Extraer información de camarero si está disponible
                            this._extractServerInfo(receipt.data, orderData);
                            
                            // Extraer notas si están disponibles
                            this._extractNotes(receipt.data, orderData);
                            
                            // Extraer nombre de la orden si está disponible
                            if (receipt.data.name) {
                                // Intentar extraer el formato "Order XXXXX-XXX-XXXX"
                                const orderNameMatch = receipt.data.name.match(/Order\s+(\d+-\d+-\d+)/i);
                                if (orderNameMatch && orderNameMatch[1]) {
                                    orderData.name = `Order ${orderNameMatch[1]}`;
                                    if (receipt.data.reprint) {
                                        orderData.name += " (Reimpresión)";
                                    }
                                    console.log("Nombre de orden extraído con formato Order XXXXX-XXX-XXXX:", orderData.name);
                                } else {
                                    // Crear un nuevo formato basado en la fecha y hora actual
                                    const now = new Date();
                                    const dateStr = now.getFullYear().toString().substr(-2) + 
                                                  (now.getMonth() + 1).toString().padStart(2, '0') + 
                                                  now.getDate().toString().padStart(2, '0');
                                    const timeStr = now.getHours().toString().padStart(2, '0') + 
                                                  now.getMinutes().toString().padStart(2, '0');
                                    const randomNum = Math.floor(1000 + Math.random() * 9000);
                                    
                                    orderData.name = `Order ${dateStr}-${timeStr}-${randomNum}`;
                                    if (receipt.data.reprint) {
                                        orderData.name += " (Reimpresión)";
                                    }
                                    console.log("Nombre de orden generado con nuevo formato:", orderData.name);
                                }
                            } else {
                                // Crear un nuevo formato basado en la fecha y hora actual
                                const now = new Date();
                                const dateStr = now.getFullYear().toString().substr(-2) + 
                                              (now.getMonth() + 1).toString().padStart(2, '0') + 
                                              now.getDate().toString().padStart(2, '0');
                                const timeStr = now.getHours().toString().padStart(2, '0') + 
                                              now.getMinutes().toString().padStart(2, '0');
                                const randomNum = Math.floor(1000 + Math.random() * 9000);
                                
                                orderData.name = `Order ${dateStr}-${timeStr}-${randomNum}`;
                                if (receipt.data && receipt.data.reprint) {
                                    orderData.name += " (Reimpresión)";
                                }
                                console.log("Nombre de orden generado con nuevo formato (sin nombre en recibo):", orderData.name);
                            }
                        }
                        
                        // Si no hay líneas de orden, crear una línea ficticia para evitar el error de datos incompletos
                        if (orderData.order_lines.length === 0) {
                            console.warn("No hay productos en la orden, creando línea ficticia");
                            orderData.order_lines.push({
                                product_id: 0,
                                product_name: "Producto sin especificar",
                                qty: 1,
                                note: "Reimpresión - No se pudieron obtener los productos",
                                price: 0
                            });
                        }
                        
                        console.log("Enviando datos para crear tarea (reimpresión completa):", JSON.stringify(orderData));
                        
                        // Llamar al endpoint para crear la tarea
                        const result = await rpc("/pos_project_integration/create_preparation_task", {
                            order_data: orderData
                        });
                        
                        console.log("Resultado de la creación de tarea:", result);
                        
                        if (result.success) {
                            self.notification.add(_t("Reimpresión completa enviada al proyecto"), { type: "success" });
                            return true;
                        } else {
                            self.notification.add(result.message || _t("Error al crear la tarea de reimpresión"), { type: "warning" });
                            return false;
                        }
                    } catch (error) {
                        console.error("Error al crear la tarea de reimpresión:", error);
                        self.notification.add(_t("Error al crear la tarea de reimpresión"), { type: "danger" });
                        return false;
                    }
                },
                
                // Método auxiliar para procesar líneas de orden
                _processOrderLines(lines, targetArray, changeType = null) {
                    if (!lines || !Array.isArray(lines) || lines.length === 0) return;
                    
                    for (const line of lines) {
                        console.log("Procesando línea de orden:", line);
                        
                        // Obtener cantidad correctamente
                        let quantity = 1;
                        if (typeof line.qty === 'number' && line.qty > 0) {
                            quantity = line.qty;
                            console.log("Cantidad obtenida de line.qty:", quantity);
                        } else if (typeof line.quantity === 'number' && line.quantity > 0) {
                            quantity = line.quantity;
                            console.log("Cantidad obtenida de line.quantity:", quantity);
                        } else if (typeof line.get_quantity === 'function') {
                            try {
                                quantity = line.get_quantity();
                                console.log("Cantidad obtenida con get_quantity():", quantity);
                            } catch (e) {
                                console.error("Error al obtener cantidad con get_quantity():", e);
                            }
                        }
                        
                        // Procesar sides/extras si existen
                        let sidesToAdd = this._processSides(line.sides);
                        
                        // Procesar atributos de combo si existen
                        let comboInfo = this._processComboItems(line.combo_items);
                        
                        // Obtener nota del producto correctamente
                        let productNote = '';
                        if (typeof line.note === 'string' && line.note.trim() !== '') {
                            productNote = line.note;
                            console.log("Nota obtenida de line.note:", productNote);
                        } else if (line.customer_note) {
                            productNote = line.customer_note;
                            console.log("Nota obtenida de line.customer_note:", productNote);
                        } else if (line.client_note) {
                            productNote = line.client_note;
                            console.log("Nota obtenida de line.client_note:", productNote);
                        } else if (line.comment) {
                            productNote = line.comment;
                            console.log("Nota obtenida de line.comment:", productNote);
                        } else if (typeof line.get_note === 'function') {
                            try {
                                const note = line.get_note();
                                if (note && note.trim() !== '') {
                                    productNote = note;
                                    console.log("Nota obtenida con get_note():", productNote);
                                }
                            } catch (e) {
                                console.error("Error al obtener nota con get_note():", e);
                            }
                        }
                        
                        // Combinar nota original con sides y combo info
                        let fullNote = productNote;
                        if (sidesToAdd) {
                            fullNote += (fullNote ? '\n' : '') + 'Extras: ' + sidesToAdd;
                        }
                        if (comboInfo) {
                            fullNote += (fullNote ? '\n' : '') + 'Combo: ' + comboInfo;
                        }
                        
                        // Verificar si hay atributos en el nombre del producto
                        let productName = line.product_name || line.name || "Producto sin nombre";
                        let attributes = line.attributes || [];
                        
                        // Intentar extraer atributos del nombre del producto si están entre paréntesis
                        const attributesInName = this._extractAttributesFromName(productName);
                        if (attributesInName) {
                            console.log("Atributos encontrados en el nombre del producto:", attributesInName);
                            // Si ya hay atributos en el nombre, añadirlos a la lista de atributos
                            if (!attributes.includes(attributesInName)) {
                                attributes.push(attributesInName);
                            }
                        } else if (attributes.length > 0) {
                            // Si no hay atributos en el nombre pero tenemos atributos, añadirlos
                            productName = `${productName} (${attributes.join(', ')})`;
                        }
                        
                        console.log("Producto final:", productName, "Cantidad:", quantity, "Nota:", fullNote);
                        
                        targetArray.push({
                            product_id: line.product_id,
                            product_name: productName,
                            qty: quantity,
                            note: fullNote,
                            price: line.price_with_tax || line.price,
                            change_type: changeType,
                            sides: line.sides || [],
                            combo_items: line.combo_items || [],
                            attributes: attributes
                        });
                    }
                },
                
                // Método auxiliar para procesar sides/extras
                _processSides(sides) {
                    if (!sides || !Array.isArray(sides) || sides.length === 0) return '';
                    
                    console.log("Procesando sides:", sides);
                    try {
                        return sides.map(side => {
                            // Manejar diferentes formatos de sides
                            if (typeof side === 'string') {
                                return `+ ${side}`;
                            } else if (side && side.name) {
                                return `+ ${side.name}`;
                            } else if (side && side.product_name) {
                                return `+ ${side.product_name}`;
                            } else {
                                console.log("Formato de side no reconocido:", side);
                                return `+ Extra`;
                            }
                        }).join(', ');
                    } catch (e) {
                        console.error("Error al procesar sides:", e);
                        if (typeof sides === 'string') {
                            return sides;
                        }
                        return '';
                    }
                },
                
                // Método auxiliar para procesar items de combo
                _processComboItems(comboItems) {
                    if (!comboItems || !Array.isArray(comboItems) || comboItems.length === 0) return '';
                    
                    return comboItems.map(item => `${item.quantity || 1}x ${item.name}`).join(', ');
                },
                
                // Método auxiliar para extraer información de mesa
                _extractTableInfo(receiptData, orderData) {
                    if (receiptData.table) {
                        orderData.table = receiptData.table.name || receiptData.table;
                        console.log("Mesa extraída del recibo:", orderData.table);
                    } else if (receiptData.table_name) {
                        orderData.table = receiptData.table_name;
                        console.log("Mesa extraída de table_name:", orderData.table);
                    }
                },
                
                // Método auxiliar para extraer información de camarero
                _extractServerInfo(receiptData, orderData) {
                    if (receiptData.server) {
                        orderData.server = receiptData.server.name || receiptData.server;
                        console.log("Camarero extraído del recibo:", orderData.server);
                    } else if (receiptData.server_name) {
                        orderData.server = receiptData.server_name;
                        console.log("Camarero extraído de server_name:", orderData.server);
                    } else if (receiptData.cashier) {
                        orderData.server = receiptData.cashier.name || receiptData.cashier;
                        console.log("Camarero extraído de cashier:", orderData.server);
                    } else if (receiptData.cashier_name) {
                        orderData.server = receiptData.cashier_name;
                        console.log("Camarero extraído de cashier_name:", orderData.server);
                    }
                },
                
                // Método auxiliar para extraer notas
                _extractNotes(receiptData, orderData) {
                    const noteSources = [
                        'note', 'order_note', 'orderNote', 'comments', 
                        'comment', 'customer_note', 'client_note'
                    ];
                    
                    for (const source of noteSources) {
                        if (receiptData[source]) {
                            orderData.note = receiptData[source];
                            console.log(`Nota extraída de ${source}:`, orderData.note);
                            return;
                        }
                    }
                    
                    // Buscar en el objeto order dentro del recibo
                    if (receiptData.order) {
                        for (const source of noteSources) {
                            if (receiptData.order[source]) {
                                orderData.note = receiptData.order[source];
                                console.log(`Nota extraída de order.${source}:`, orderData.note);
                                return;
                            }
                        }
                    }
                },
                
                // Método para extraer atributos del nombre del producto
                _extractAttributesFromName(productName) {
                    if (!productName) return null;
                    
                    // Buscar texto entre paréntesis
                    const match = productName.match(/\((.*?)\)/);
                    if (match && match[1]) {
                        return match[1].trim();
                    }
                    return null;
                },
                
                // Método para obtener atributos del producto
                _getProductAttributes(line) {
                    try {
                        // Intentar diferentes métodos para obtener atributos
                        if (typeof line.get_attributes === 'function') {
                            const attrs = line.get_attributes();
                            if (attrs && attrs.length > 0) {
                                return attrs.map(a => a.name || a.display_name || a.toString());
                            }
                        }
                        
                        // Buscar en propiedades comunes
                        const attrProps = ['attributes', 'attribute_value_ids', 'attribute_values', 'variants'];
                        for (const prop of attrProps) {
                            if (line[prop] && Array.isArray(line[prop]) && line[prop].length > 0) {
                                return line[prop].map(a => {
                                    if (typeof a === 'string') return a;
                                    return a.name || a.display_name || a.value || a.toString();
                                });
                            }
                        }
                        
                        // Intentar obtener del producto
                        if (typeof line.get_product === 'function' && line.get_product()) {
                            const product = line.get_product();
                            for (const prop of attrProps) {
                                if (product[prop] && Array.isArray(product[prop]) && product[prop].length > 0) {
                                    return product[prop].map(a => {
                                        if (typeof a === 'string') return a;
                                        return a.name || a.display_name || a.value || a.toString();
                                    });
                                }
                            }
                        }
                        
                        // Buscar en el full_product_name si existe
                        if (line.full_product_name) {
                            const attrs = this._extractAttributesFromName(line.full_product_name);
                            if (attrs) {
                                return attrs.split(',').map(a => a.trim());
                            }
                        }
                        
                        return null;
                    } catch (e) {
                        console.error("Error al obtener atributos del producto:", e);
                        return null;
                    }
                },
                
                // Funciones requeridas por el POS
                printReceipt: async function(receipt) {
                    console.log("Llamando a printReceipt con:", receipt);
                    
                    try {
                        // Si el recibo es un elemento HTML, extraer los datos
                        if (receipt instanceof HTMLElement) {
                            console.log("Recibo es un elemento HTML, extrayendo datos...");
                            
                            // Crear un objeto de recibo con los datos extraídos
                            const extractedReceipt = {
                                data: this._extractDataFromHtmlReceipt(receipt)
                            };
                            
                            console.log("Datos extraídos del recibo HTML:", extractedReceipt);
                            
                            // Usar los datos extraídos
                            const result = await this.createProjectTask(extractedReceipt);
                            return {
                                successful: result,
                                message: result ? undefined : {
                                    title: _t("Error de impresión"),
                                    body: _t("No se pudo crear la tarea en el proyecto")
                                }
                            };
                        }
                        
                        // Proceder con el recibo normal
                        const result = await this.createProjectTask(receipt);
                        return {
                            successful: result,
                            message: result ? undefined : {
                                title: _t("Error de impresión"),
                                body: _t("No se pudo crear la tarea en el proyecto")
                            }
                        };
                    } catch (error) {
                        console.error("Error en printReceipt:", error);
                        return {
                            successful: false,
                            message: {
                                title: _t("Error de impresión"),
                                body: _t("Error al procesar el recibo: ") + error.message
                            }
                        };
                    }
                },
                
                // Método auxiliar para extraer datos de un recibo HTML
                _extractDataFromHtmlReceipt(htmlReceipt) {
                    console.log("Extrayendo datos de recibo HTML");
                    
                    try {
                        const receiptData = {
                            orderlines: [],
                            name: '',
                            table: null,
                            server: null,
                            note: ''
                        };
                        
                        // Extraer nombre de la orden
                        const orderNameEl = htmlReceipt.querySelector('.pos-receipt-order-name');
                        if (orderNameEl) {
                            receiptData.name = orderNameEl.textContent.trim();
                            console.log("Nombre de orden extraído:", receiptData.name);
                        }
                        
                        // Extraer información de mesa
                        const tableEl = htmlReceipt.querySelector('.pos-receipt-table');
                        if (tableEl) {
                            receiptData.table = tableEl.textContent.trim();
                            console.log("Mesa extraída:", receiptData.table);
                        }
                        
                        // Extraer información de camarero
                        const serverEl = htmlReceipt.querySelector('.pos-receipt-server, .pos-receipt-cashier');
                        if (serverEl) {
                            receiptData.server = serverEl.textContent.trim();
                            console.log("Camarero extraído:", receiptData.server);
                        }
                        
                        // Extraer nota general
                        const noteEl = htmlReceipt.querySelector('.pos-receipt-note, .pos-receipt-customer-note');
                        if (noteEl) {
                            receiptData.note = noteEl.textContent.trim();
                            console.log("Nota general extraída:", receiptData.note);
                        }
                        
                        // Extraer líneas de productos
                        const orderlineEls = htmlReceipt.querySelectorAll('.orderline');
                        console.log("Elementos de línea encontrados:", orderlineEls.length);
                        
                        orderlineEls.forEach((lineEl, index) => {
                            try {
                                const productNameEl = lineEl.querySelector('.product-name');
                                const quantityEl = lineEl.querySelector('.price-or-qty');
                                const noteEl = lineEl.querySelector('.note');
                                
                                const productName = productNameEl ? productNameEl.textContent.trim() : `Producto ${index + 1}`;
                                const quantityText = quantityEl ? quantityEl.textContent.trim() : '1';
                                const note = noteEl ? noteEl.textContent.trim() : '';
                                
                                // Intentar extraer la cantidad numérica
                                let quantity = 1;
                                const qtyMatch = quantityText.match(/(\d+(\.\d+)?)/);
                                if (qtyMatch) {
                                    quantity = parseFloat(qtyMatch[1]);
                                }
                                
                                console.log(`Línea ${index + 1}: Producto=${productName}, Cantidad=${quantity}, Nota=${note}`);
                                
                                receiptData.orderlines.push({
                                    product_name: productName,
                                    qty: quantity,
                                    note: note,
                                    product_id: 0, // No podemos obtener el ID del producto del HTML
                                    price: 0 // No podemos obtener el precio del HTML
                                });
                            } catch (e) {
                                console.error(`Error al procesar línea ${index + 1}:`, e);
                            }
                        });
                        
                        // Si no se encontraron líneas, intentar otro formato
                        if (receiptData.orderlines.length === 0) {
                            console.log("Intentando formato alternativo para líneas de productos");
                            
                            const productEls = htmlReceipt.querySelectorAll('.pos-receipt-productname');
                            const qtyEls = htmlReceipt.querySelectorAll('.pos-receipt-quantity');
                            
                            console.log("Elementos de producto encontrados:", productEls.length);
                            console.log("Elementos de cantidad encontrados:", qtyEls.length);
                            
                            for (let i = 0; i < productEls.length; i++) {
                                try {
                                    const productName = productEls[i].textContent.trim();
                                    const quantity = i < qtyEls.length ? parseFloat(qtyEls[i].textContent.trim()) : 1;
                                    
                                    console.log(`Línea alternativa ${i + 1}: Producto=${productName}, Cantidad=${quantity}`);
                                    
                                    receiptData.orderlines.push({
                                        product_name: productName,
                                        qty: quantity,
                                        note: '',
                                        product_id: 0,
                                        price: 0
                                    });
                                } catch (e) {
                                    console.error(`Error al procesar línea alternativa ${i + 1}:`, e);
                                }
                            }
                        }
                        
                        return receiptData;
                    } catch (e) {
                        console.error("Error al extraer datos del recibo HTML:", e);
                        return {
                            orderlines: [{
                                product_name: "Error al procesar recibo",
                                qty: 1,
                                note: e.message,
                                product_id: 0,
                                price: 0
                            }]
                        };
                    }
                },
                
                printPackingReceipt: async function(receipt) {
                    console.log("Llamando a printPackingReceipt con:", receipt);
                    const result = await this.createProjectTask(receipt);
                    return {
                        successful: result,
                        message: result ? undefined : {
                            title: _t("Error de impresión"),
                            body: _t("No se pudo crear la tarea en el proyecto")
                        }
                    };
                },
                
                printChanges: async function(receipt) {
                    console.log("Llamando a printChanges con:", receipt);
                    
                    try {
                        // Verificar si hay cambios en el recibo
                        if (receipt && receipt.data) {
                            console.log("Estructura del recibo de cambios:", JSON.stringify(receipt.data));
                            
                            // Verificar si hay cambios en el formato estándar
                            if (receipt.data.changes) {
                                const hasChanges = (
                                    (receipt.data.changes.new && receipt.data.changes.new.length > 0) || 
                                    (receipt.data.changes.cancelled && receipt.data.changes.cancelled.length > 0)
                                );
                                
                                if (!hasChanges) {
                                    console.log("No hay cambios para imprimir en el formato estándar");
                                    return {
                                        successful: true,
                                        message: undefined
                                    };
                                }
                            } 
                            // Verificar formato alternativo de cambios
                            else if (receipt.data.orderlines) {
                                console.log("Usando formato alternativo para detectar cambios");
                                // Continuar con la creación de la tarea
                            }
                            // Si no hay estructura reconocible, registrar para depuración
                            else {
                                console.log("Formato de recibo no reconocido para cambios:", receipt.data);
                                // Intentar procesar de todos modos
                            }
                        }
                        
                        const result = await this.createProjectTask(receipt);
                        return {
                            successful: result,
                            message: result ? undefined : {
                                title: _t("Error de impresión"),
                                body: _t("No se pudo crear la tarea en el proyecto")
                            }
                        };
                    } catch (error) {
                        console.error("Error en printChanges:", error);
                        return {
                            successful: false,
                            message: {
                                title: _t("Error de impresión"),
                                body: _t("Error al procesar los cambios: ") + error.message
                            }
                        };
                    }
                },
                
                print: async function(receipt) {
                    console.log("Llamando a print con:", receipt);
                    const result = await this.createProjectTask(receipt);
                    return {
                        successful: result,
                        message: result ? undefined : {
                            title: _t("Error de impresión"),
                            body: _t("No se pudo crear la tarea en el proyecto")
                        }
                    };
                },
                
                // Otras funciones necesarias
                isConnected: function() {
                    return true;
                },
                
                openCashbox: function() {
                    return Promise.resolve(true);
                },
                
                // Para evitar errores con otras funciones que puedan ser llamadas
                send_printing_job: function() {
                    return Promise.resolve(true);
                },
                
                // Métodos de impresión específicos
                print_receipt: function() {
                    return Promise.resolve(true);
                },
                
                print_status: function() {
                    return { status: 'connected', messages: [] };
                }
            };
        } else {
            return super.create_printer(...arguments);
        }
    },
}); 