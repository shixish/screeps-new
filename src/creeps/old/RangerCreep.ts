
class RangerCreep extends BaseCreepOld {
    public creep: Creep;
    // public flag: Flag;

    constructor(creep: Creep) {
        super(creep);

        // if (!this.creep.memory.flag) {
        //     this.creep.memory.flag = this.creep.room.name + '_attack';
        //     this.flag = <Flag>Game.flags[this.creep.memory.flag];
        // } else {
        //     this.flag = <Flag>Game.flags[this.creep.memory.flag];
        // }
        // console.log(this.creep, this.flag);
        // this.retarget();
    }

    retarget() {
        super.retarget();
        // this.flag.remove();
        // this.creep.room.memory.under_attack

        if (!super.try_to('GoOffice')) {
            if (!super.try_to('Attack')) {

            }
        }
    }

    // static create(budget: number) {
    //     if (budget >= 50 * 10 + 150 * 10)
    //         return [
    //             // TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
    //             MOVE, RANGED_ATTACK, MOVE, RANGED_ATTACK,
    //             MOVE, RANGED_ATTACK, MOVE, RANGED_ATTACK,
    //             MOVE, RANGED_ATTACK, MOVE, RANGED_ATTACK,
    //             MOVE, RANGED_ATTACK, MOVE, RANGED_ATTACK,
    //             MOVE, RANGED_ATTACK, MOVE, RANGED_ATTACK,
    //         ];
    //     // if (budget >= 10*10 + 50*10 + 150*10)
    //     //     return [
    //     //         TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
    //     //         MOVE, RANGED_ATTACK, MOVE, RANGED_ATTACK,
    //     //         MOVE, RANGED_ATTACK, MOVE, RANGED_ATTACK,
    //     //         MOVE, RANGED_ATTACK, MOVE, RANGED_ATTACK,
    //     //         MOVE, RANGED_ATTACK, MOVE, RANGED_ATTACK,
    //     //         MOVE, RANGED_ATTACK, MOVE, RANGED_ATTACK,
    //     //     ];
    //     if (budget >= 50*5 + 150*5)
    //         return [
    //             MOVE, RANGED_ATTACK,
    //             MOVE, RANGED_ATTACK,
    //             MOVE, RANGED_ATTACK,
    //             MOVE, RANGED_ATTACK,
    //             MOVE, RANGED_ATTACK,
    //         ];
    // }

    static creep_tiers = [
        {
            'cost': 50 * 10 + 150 * 10,
            'body': [
                MOVE, RANGED_ATTACK, MOVE, RANGED_ATTACK,
                MOVE, RANGED_ATTACK, MOVE, RANGED_ATTACK,
                MOVE, RANGED_ATTACK, MOVE, RANGED_ATTACK,
                MOVE, RANGED_ATTACK, MOVE, RANGED_ATTACK,
                MOVE, RANGED_ATTACK, MOVE, RANGED_ATTACK,
            ],
        },
        {
            'cost': 50 * 5 + 150 * 5,
            'body': [
                MOVE, RANGED_ATTACK,
                MOVE, RANGED_ATTACK,
                MOVE, RANGED_ATTACK,
                MOVE, RANGED_ATTACK,
                MOVE, RANGED_ATTACK,
            ],
        },
        {
            'cost': 50 * 3 + 150 * 3,
            'body': [
                MOVE, RANGED_ATTACK,
                MOVE, RANGED_ATTACK,
                MOVE, RANGED_ATTACK,
            ],
        },
    ];

}
CreepControllers['Ranger'] = RangerCreep;
