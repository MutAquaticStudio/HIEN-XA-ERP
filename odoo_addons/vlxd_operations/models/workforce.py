from odoo import api, fields, models
from odoo.exceptions import UserError, ValidationError


class VlxdWorkOrder(models.Model):
    _name = "vlxd.work.order"
    _description = "VLXD Work Order"
    _inherit = ["mail.thread", "mail.activity.mixin"]

    name = fields.Char(required=True, copy=False, tracking=True)
    work_type = fields.Char(required=True)
    work_date = fields.Date(required=True, default=fields.Date.context_today)
    output_ids = fields.One2many("vlxd.work.output", "work_order_id")
    participant_ids = fields.One2many("vlxd.work.participant", "work_order_id")
    company_id = fields.Many2one("res.company", default=lambda self: self.env.company, required=True)
    state = fields.Selection(
        [("submitted", "Submitted"), ("approved", "Approved"), ("compensated", "Compensated"), ("paid", "Paid")],
        default="submitted",
        tracking=True,
    )


class VlxdWorkOutput(models.Model):
    _name = "vlxd.work.output"
    _description = "VLXD Work Output"

    work_order_id = fields.Many2one("vlxd.work.order", required=True, ondelete="cascade")
    product_unit_id = fields.Many2one("vlxd.product.unit", required=True)
    actual_quantity = fields.Float(required=True)
    approved_quantity = fields.Float(default=0.0, readonly=True)
    state = fields.Selection([("submitted", "Submitted"), ("approved", "Approved"), ("compensated", "Compensated")], default="submitted")

    @api.constrains("actual_quantity", "approved_quantity")
    def _check_quantities(self):
        for output in self:
            if output.actual_quantity <= 0:
                raise ValidationError("Actual quantity must be greater than zero.")
            if output.approved_quantity > output.actual_quantity:
                raise ValidationError("Approved quantity cannot exceed actual quantity.")


class VlxdWorkParticipant(models.Model):
    _name = "vlxd.work.participant"
    _description = "VLXD Work Participant"

    work_order_id = fields.Many2one("vlxd.work.order", required=True, ondelete="cascade")
    employee_id = fields.Many2one("vlxd.employee", required=True)
    share_factor = fields.Float(default=1.0, required=True)

    @api.constrains("share_factor")
    def _check_share_factor(self):
        for participant in self:
            if participant.share_factor <= 0:
                raise ValidationError("Share factor must be greater than zero.")


class VlxdCompensationBatch(models.Model):
    _name = "vlxd.compensation.batch"
    _description = "VLXD Compensation Batch"
    _inherit = ["mail.thread", "mail.activity.mixin"]

    name = fields.Char(required=True, copy=False, tracking=True)
    total_amount = fields.Monetary(currency_field="currency_id", required=True)
    line_ids = fields.One2many("vlxd.compensation.line", "batch_id")
    currency_id = fields.Many2one("res.currency", default=lambda self: self.env.company.currency_id)
    company_id = fields.Many2one("res.company", default=lambda self: self.env.company, required=True)
    state = fields.Selection([("draft", "Draft"), ("posted", "Posted")], default="draft", tracking=True)

    @api.constrains("total_amount")
    def _check_total_amount(self):
        for batch in self:
            if batch.total_amount <= 0:
                raise ValidationError("Total compensation must be greater than zero.")


class VlxdCompensationLine(models.Model):
    _name = "vlxd.compensation.line"
    _description = "VLXD Compensation Line"

    batch_id = fields.Many2one("vlxd.compensation.batch", required=True, ondelete="cascade")
    employee_id = fields.Many2one("vlxd.employee", required=True)
    work_output_id = fields.Many2one("vlxd.work.output", required=True)
    amount_total = fields.Monetary(currency_field="currency_id", required=True)
    currency_id = fields.Many2one(related="batch_id.currency_id", store=True)


class VlxdEmployeeLedgerEntry(models.Model):
    _name = "vlxd.employee.ledger.entry"
    _description = "VLXD Employee Ledger Entry"
    _inherit = ["mail.thread", "mail.activity.mixin"]

    name = fields.Char(required=True, copy=False)
    employee_id = fields.Many2one("vlxd.employee", required=True)
    source_document = fields.Char(required=True)
    direction = fields.Selection([("debit", "Debit"), ("credit", "Credit")], required=True)
    amount_total = fields.Monetary(currency_field="currency_id", required=True)
    currency_id = fields.Many2one("res.currency", default=lambda self: self.env.company.currency_id)
    company_id = fields.Many2one("res.company", default=lambda self: self.env.company, required=True)
    state = fields.Selection([("posted", "Posted"), ("reversed", "Reversed")], default="posted", readonly=True)

    def unlink(self):
        raise UserError("Employee ledger entries are append-only. Use reversal instead.")
