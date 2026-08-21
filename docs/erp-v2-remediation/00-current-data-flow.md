# R-004 Current Data Flow Map

Status: `CURRENT_DATA_FLOW_MAP=PASS`

```text
identity/auth context
        |
        v
projectOperationsSnapshot(snapshot, user)
        |
        v
OperationsState projection -> web/mobile read models
        |
        v
OperationsCommandService
        |
        +--> registry permission check
        +--> runCreateCommand or runOperation
        +--> domain validation/invariants/audit/idempotency
        +--> backend CAS write and revision increment
```

## Cross-module ID relationships currently present

| Source ID | References |
|---|---|
| Customer.id | SalesOrder.customerId, customer ledger/payment/proof IDs |
| Supplier.id | PurchaseOrder.supplierId, supplier ledger/payment IDs |
| ProductUnit.id | sales/purchase lines, inventory movements/count lines, work outputs |
| Warehouse.id | purchase destination, allocation source, inventory movement/count scope |
| Employee.id | driver/worker/work participant, compensation, employee payment/advance |
| Vehicle.id | DeliveryJob.vehicleId |
| SalesOrder.id | DeliveryJob.salesOrderId, work-order source, customer payment proof |
| PurchaseOrder.id | receipt, supplier response/notice, freight allocation |

## Persistence and propagation boundary

Memory/file/Postgres/D1 backends expose a snapshot revision and CAS mutation
contract. Server actions and mobile routes re-read/project snapshots after
authorized commands. Current UI forms still contain direct state mappings and
first-row defaults; this is recorded as a future R-008+ remediation gap, not
fixed today.
