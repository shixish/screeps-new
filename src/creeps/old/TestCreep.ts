
class TestCreep extends BaseCreepOld {
    public creep: Creep;

    constructor(creep: Creep) {
        super(creep);
    }

    retarget() {
        super.retarget();
        if (!super.try_to('GoOffice')) {

        }
    }

    static creep_tiers = [
        {//Path Testing
            'cost': 50,
            'body': [
                MOVE,
            ],
        },
    ];

}
CreepControllers['Test'] = TestCreep;
