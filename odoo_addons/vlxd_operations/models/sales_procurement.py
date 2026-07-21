from odoo import api, fields, models
from odoo.exceptions import ValidationError


class VlxdSalesOrder(models.Model):
    _name = "vlxd.sales.order"
    _description = "VLXD Sales Order"
    _inherit = ["mail.thread", "mail.activity.mixin"]

    name = fields.Char(required=True, copy=False, tracking=True)
    customer_id = fields.Many2one("vlxd.customer", required=True, tracking=True)
    order_date = fields.Date(required=True, default=fields.Date.context_today)
    state = fields.Selection(
        [
            ("draft", "Draft"),
            ("confirmed", "Confirmed"),
            ("allocated", "Allocated"),
            ("partially_delivered", "Partially Delivered"),
            ("delivered", "Delivered"),
        ],
        default="draft",
        tracking=True,
    )
    line_ids = fields.One2many("vlxd.sales.order.line", "order_id")
    amount_total = fields.Monetary(compute="_compute_amount_total", currency_field="currency_id", store=True)
    currency_id = fields.Many2one("res.currency", default=lambda self: self.env.company.currency_id)
    company_id = fields.Many2one("res.company", default=lambda self: self.env.company, required=True)

    @api.depends("line_ids.amount_total")
    def _compute_amount_total(self):
        for order in self:
            order.amount_total = sum(order.line_ids.mapped("amount_total"))


class VlxdSalesOrderLine(models.Model):
    _name = "vlxd.sales.order.line"
    _description = "VLXD Sales Order Line"

    order_id = fields.Many2one("vlxd.sales.order", required=True, ondelete="cascade")
    product_unit_id = fields.Many2one("vlxd.product.unit", required=True)
    quantity = fields.Float(required=True)
    delivered_quantity = fields.Float(default=0.0, readonly=True)
    unit_price = fields.Monetary(currency_field="currency_id", required=True)
    tax_rate = fields.Float(default=0.0)
    source_type = fields.Selection([("warehouse", "Warehouse"), ("direct_supplier", "Direct Supplier")])
    amount_total = fields.Monetary(compute="_compute_amount_total", currency_field="currency_id", store=True)
    currency_id = fields.Many2one(related="order_id.currency_id", store=True)

    @api.depends("quantity", "unit_price", "tax_rate")
    def _compute_amount_total(self):
        for line in self:
            line.amount_total = line.quantity * line.unit_price * (1 + line.tax_rate)

    @api.constrains("quantity", "delivered_quantity", "unit_price", "tax_rate")
    def _check_sales_values(self):
        for line in self:
            if line.quantity <= 0:
                raise ValidationError("Sales quantity must be greater than zero.")
            if line.delivered_quantity > line.quantity:
                raise ValidationError("Delivered quantity cannot exceed ordered quantity.")
            if line.unit_price < 0 or line.tax_rate < 0:
                raise ValidationError("Unit price and tax rate cannot be negative.")


class VlxdPurchaseOrder(models.Model):
    _name = "vlxd.purchase.order"
    _description = "VLXD Purchase Order"
    _inherit = ["mail.thread", "mail.activity.mixin"]

    name = fields.Char(required=True, copy=False, tracking=True)
    supplier_id = fields.Many2one("vlxd.supplier", required=True, tracking=True)
    order_date = fields.Date(required=True, default=fields.Date.context_today)
    state = fields.Selection(
        [("draft", "Draft"), ("ordered", "Ordered"), ("partially_received", "Partially Received"), ("fully_received", "Fully Received")],
        default="draft",
        tracking=True,
    )
    line_ids = fields.One2many("vlxd.purchase.order.line", "order_id")
    amount_total = fields.Monetary(compute="_compute_amount_total", currency_field="currency_id", store=True)
    currency_id = fields.Many2one("res.currency", default=lambda self: self.env.company.currency_id)
    company_id = fields.Many2one("res.company", default=lambda self: self.env.company, required=True)

    @api.depends("line_ids.amount_total")
    def _compute_amount_total(self):
        for order in self:
            order.amount_total = sum(order.line_ids.mapped("amount_total"))


class VlxdPurchaseOrderLine(models.Model):
    _name = "vlxd.purchase.order.line"
    _description = "VLXD Purchase Order Line"

    order_id = fields.Many2one("vlxd.purchase.order", required=True, ondelete="cascade")
    product_unit_id = fields.Many2one("vlxd.product.unit", required=True)
    ordered_quantity = fields.Float(required=True)
    received_quantity = fields.Float(default=0.0, readonly=True)
    unit_cost = fields.Monetary(currency_field="currency_id", required=True)
    tax_rate = fields.Float(default=0.0)
    destination_type = fields.Selection([("warehouse", "Warehouse"), ("customer_direct", "Customer Direct")], required=True)
    customer_id = fields.Many2one("vlxd.customer")
    amount_total = fields.Monetary(compute="_compute_amount_total", currency_field="currency_id", store=True)
    currency_id = fields.Many2one(related="order_id.currency_id", store=True)

    @api.depends("ordered_quantity", "unit_cost", "tax_rate")
    def _compute_amount_total(self):
        for line in self:
            line.amount_total = line.ordered_quantity * line.unit_cost * (1 + line.tax_rate)

    @api.constrains("ordered_quantity", "received_quantity", "unit_cost", "tax_rate", "destination_type", "customer_id")
    def _check_purchase_values(self):
        for line in self:
            if line.ordered_quantity <= 0:
                raise ValidationError("Purchase quantity must be greater than zero.")
            if line.received_quantity > line.ordered_quantity:
                raise ValidationError("Received quantity cannot exceed ordered quantity.")
            if line.unit_cost < 0 or line.tax_rate < 0:
                raise ValidationError("Unit cost and tax rate cannot be negative.")
            if line.destination_type == "customer_direct" and not line.customer_id:
                raise ValidationError("Direct delivery requires a customer.")
