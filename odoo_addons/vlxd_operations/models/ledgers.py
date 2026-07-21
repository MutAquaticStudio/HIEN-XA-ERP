from odoo import fields, models
from odoo.exceptions import UserError


class VlxdInventoryMovement(models.Model):
    _name = "vlxd.inventory.movement"
    _description = "VLXD Inventory Movement"
    _inherit = ["mail.thread", "mail.activity.mixin"]

    name = fields.Char(required=True, copy=False)
    movement_type = fields.Selection([("opening", "Opening"), ("receipt", "Receipt"), ("issue", "Issue"), ("reverse", "Reverse")], required=True)
    source_document = fields.Char(required=True)
    posting_key = fields.Char(required=True, copy=False)
    product_unit_id = fields.Many2one("vlxd.product.unit", required=True)
    quantity = fields.Float(required=True)
    unit_cost = fields.Monetary(currency_field="currency_id")
    currency_id = fields.Many2one("res.currency", default=lambda self: self.env.company.currency_id)
    company_id = fields.Many2one("res.company", default=lambda self: self.env.company, required=True)
    state = fields.Selection([("posted", "Posted"), ("reversed", "Reversed")], default="posted", readonly=True)

    _sql_constraints = [
        ("posting_key_unique", "unique(posting_key)", "Inventory posting key must be unique."),
    ]

    def unlink(self):
        raise UserError("Posted inventory movements are append-only. Use reversal instead.")


class VlxdCustomerLedgerEntry(models.Model):
    _name = "vlxd.customer.ledger.entry"
    _description = "VLXD Customer Ledger Entry"
    _inherit = ["mail.thread", "mail.activity.mixin"]

    name = fields.Char(required=True, copy=False)
    customer_id = fields.Many2one("vlxd.customer", required=True)
    source_document = fields.Char(required=True)
    direction = fields.Selection([("debit", "Debit"), ("credit", "Credit")], required=True)
    amount_total = fields.Monetary(currency_field="currency_id", required=True)
    currency_id = fields.Many2one("res.currency", default=lambda self: self.env.company.currency_id)
    company_id = fields.Many2one("res.company", default=lambda self: self.env.company, required=True)
    state = fields.Selection([("posted", "Posted"), ("reversed", "Reversed")], default="posted", readonly=True)

    def unlink(self):
        raise UserError("Customer ledger entries are append-only. Use reversal instead.")


class VlxdSupplierLedgerEntry(models.Model):
    _name = "vlxd.supplier.ledger.entry"
    _description = "VLXD Supplier Ledger Entry"
    _inherit = ["mail.thread", "mail.activity.mixin"]

    name = fields.Char(required=True, copy=False)
    supplier_id = fields.Many2one("vlxd.supplier", required=True)
    source_document = fields.Char(required=True)
    direction = fields.Selection([("debit", "Debit"), ("credit", "Credit")], required=True)
    amount_total = fields.Monetary(currency_field="currency_id", required=True)
    currency_id = fields.Many2one("res.currency", default=lambda self: self.env.company.currency_id)
    company_id = fields.Many2one("res.company", default=lambda self: self.env.company, required=True)
    state = fields.Selection([("posted", "Posted"), ("reversed", "Reversed")], default="posted", readonly=True)

    def unlink(self):
        raise UserError("Supplier ledger entries are append-only. Use reversal instead.")


class VlxdCustomerPayment(models.Model):
    _name = "vlxd.customer.payment"
    _description = "VLXD Customer Payment"
    _inherit = ["mail.thread", "mail.activity.mixin"]

    name = fields.Char(required=True, copy=False, tracking=True)
    customer_id = fields.Many2one("vlxd.customer", required=True, tracking=True)
    amount_total = fields.Monetary(currency_field="currency_id", required=True)
    allocation_ids = fields.One2many("vlxd.customer.payment.allocation", "payment_id")
    currency_id = fields.Many2one("res.currency", default=lambda self: self.env.company.currency_id)
    company_id = fields.Many2one("res.company", default=lambda self: self.env.company, required=True)
    state = fields.Selection([("draft", "Draft"), ("confirmed", "Confirmed"), ("allocated", "Allocated"), ("reversed", "Reversed")], default="draft", tracking=True)


class VlxdCustomerPaymentAllocation(models.Model):
    _name = "vlxd.customer.payment.allocation"
    _description = "VLXD Customer Payment Allocation"

    payment_id = fields.Many2one("vlxd.customer.payment", required=True, ondelete="cascade")
    ledger_entry_id = fields.Many2one("vlxd.customer.ledger.entry", required=True)
    amount_total = fields.Monetary(currency_field="currency_id", required=True)
    currency_id = fields.Many2one(related="payment_id.currency_id", store=True)


class VlxdSupplierPayment(models.Model):
    _name = "vlxd.supplier.payment"
    _description = "VLXD Supplier Payment"
    _inherit = ["mail.thread", "mail.activity.mixin"]

    name = fields.Char(required=True, copy=False, tracking=True)
    supplier_id = fields.Many2one("vlxd.supplier", required=True, tracking=True)
    amount_total = fields.Monetary(currency_field="currency_id", required=True)
    currency_id = fields.Many2one("res.currency", default=lambda self: self.env.company.currency_id)
    company_id = fields.Many2one("res.company", default=lambda self: self.env.company, required=True)
    state = fields.Selection([("draft", "Draft"), ("confirmed", "Confirmed"), ("reversed", "Reversed")], default="draft", tracking=True)
