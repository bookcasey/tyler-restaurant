const service = require("./tables.service");
const asyncErrorBoundary = require("../errors/asyncErrorBoundary");
const hasProperties = require("../errors/hasProperties");
const hasOnlyValidProperties = require("../errors/hasOnlyValidProperties");
const reservationService = require("../reservations/reservations.service");


const VALID_PROPERTIES_POST = [
    "table_name",
    "capacity",
]

const VALID_PROPERTIES_PUT = [
    "reservation_id"
]

// validation middleware: checks that table_name is at least 2 characters
function tableNameLength(req, res, next) {
    const { table_name } = req.body.data;
    if (table_name.length > 1) {
        return next();
    } else {
        return next({
            status: 400,
            message: "table_name must be at least 2 characters in length."
        });
    }
}

// validation middleware: checks that capacity is a number
function capacityIsNumber(req, res, next) {
    const { capacity } = req.body.data;
    if(!capacity || capacity.length){ 
        return next({
        status: 400, 
        message: `capacity field formatted incorrectly: ${capacity}. Needs to be a number.`
        });
    } else {
        return next();
    }
}

// validation middleware: checks that table_name exists
async function tableExists(req, res, next) {
    const { table_id } = req.params;
    const data = await service.read(table_id);
    if (data) {
        res.locals.table = data;
        return next();
    } else {
        return next({
            status: 404,
            message: `table_id: ${table_id} does not exist.`
        });
    }
}

// validation middleware: checks that reservation exists
async function reservationExists(req, res, next) {
    const { reservation_id } = req.body.data;
    const data = await reservationService.read(reservation_id);
    if (data && data.status !== "seated") {
        res.locals.reservation = data;
        return next();
    } else if (data && data.status === "seated") {
        return next({
            status: 400,
            message: `reservation_id: ${reservation_id} is already seated.`,
        });
    } else {
        return next({
            status: 404,
            message: `reservation_id: ${reservation_id} does not exist.`,
        });
    }
}

// validation middleware: checks that table had sufficient capacity
function tableCapacity(req, res, next) { 
    const { capacity } = res.locals.table;
    const { people } = res.locals.reservation;
    if (people > capacity) {
        return next({
            status: 400, 
            message: "Table does not have sufficient capacity."
        });
    } else {
        return next();
    }
}

// validation middleware: checks if table status is free
function tableStatusFree(req, res, next) {
    if (res.locals.table.reservation_id) {
        return next({
          status: 400,
          message: "Table is currently occupied."
        });
      } else {
        next();
      }
    }    

// validation middleware: checks if table status is free
function tableStatusOccupied(req, res, next) {
    const reservation_id = res.locals.table.reservation_id;
    if(reservation_id){
        return next();
    } else {
        return next({
            status:400,
            message: "Table is not occupied."
          })
        }
    }

    function tableIsNotOccupied(req, res, next) {
        const reservation_id = res.locals.table.reservation_id;
        if (!reservation_id) {
          return next({ status: 400, message: "table is not occupied" });
        }
        next();
      }

// list all tables - sorted by table_name
async function list(req, res) {
    res.json({ data: await service.list() });
  }

// create a new table
async function create(req, res) {
    const table = await service.create(req.body.data);
    res.status(201).json({ data: table });
}

// seat a reservation at a table
async function seat(req, res) {
    const { reservation_id } = req.body.data;
    const { table_id } = req.params;
    const { table } = res.locals;
    // const updatedTableData = {
    //     // ...table,
    //     ...req.body.data,
    //     table_id: res.locals.table.table_id,
    //     reservation_id: reservation_id,
    //     status: "Occupied",
    // }
    // console.log("line 144", updatedTableData);
    // const updatedTable = await service.seat(updatedTableData);
    // // set reservation status to "seated" using reservation id
    // const updatedReservation = {
    //     status: "seated", 
    //     reservation_id: reservation_id,
    // }
   const data = await service.seat(Number(reservation_id), Number(table_id));
    // await reservationService.update(updatedReservation);
    // res.json({ data: updatedTable });
    res.status(200).json({ data });
}

async function validateTableId(request, response, next) {
    const { table_id } = request.params;
    const table = await service.read(table_id);
    if (!table) {
    return next({
    status: 404,
    message: `table id ${table_id} does not exist`,
    });
    }
    response.locals.table = table;
    next();
    }

    async function validateSeatedTable(request, response, next) {
        if (response.locals.table.status !== "occupied") {
        return next({ status: 400, message: "this table is not occupied" });
        }
        next();
        }

// finish an occupied table
async function finish(req, res) {
    const { table_id } = req.params;
    const { table } = res.locals;
    const updatedTableData = {
        ...table,
        status: "Free"
    }
    const updatedTable = await service.finish(updatedTableData);
    // set reservation status to "finished" using reservation id
    const updatedReservation = {
        status: "finished", 
        reservation_id: table.reservation_id,
    }
    await reservationService.update(updatedReservation); 
    res.json({ data: updatedTable });
}

module.exports = {
    list: asyncErrorBoundary(list),
    create: [
        hasProperties(...VALID_PROPERTIES_POST), 
        hasOnlyValidProperties(...VALID_PROPERTIES_POST, "reservation_id"), 
        tableNameLength,
        capacityIsNumber,
        asyncErrorBoundary(create)],
    seat: [
        hasProperties(...VALID_PROPERTIES_PUT), 
        hasOnlyValidProperties(...VALID_PROPERTIES_PUT), 
        asyncErrorBoundary(tableExists),
        asyncErrorBoundary(reservationExists),
        tableCapacity,
        tableStatusFree,
        asyncErrorBoundary(seat),
    ],
    finish: [
        asyncErrorBoundary(validateTableId),
        asyncErrorBoundary(tableExists),
        asyncErrorBoundary(validateSeatedTable),
       // asyncErrorBoundary(tableIsNotOccupied),
        asyncErrorBoundary(tableStatusOccupied),
        asyncErrorBoundary(finish),
        ]
  };