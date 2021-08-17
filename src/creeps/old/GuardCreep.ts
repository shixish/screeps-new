
class GuardCreep extends BaseCreepOld {
    public creep: Creep;
    public flag: Flag;

    constructor(creep: Creep) {
        super(creep);

        if (!this.creep.memory.flag) {
            this.creep.memory.flag = this.creep.room.name + '_attack';
            this.flag = <Flag>Game.flags[this.creep.memory.flag];
        } else {
            this.flag = <Flag>Game.flags[this.creep.memory.flag];
        }
        // console.log(this.creep, this.flag)
        // this.retarget();
    }

    retarget() {
        super.retarget();
        // this.flag.remove();
        // this.creep.room.memory.under_attack
        // if (!super.try_to('fighting')) {

        // if (!super.try_to('kiting')) {
        //     if (!super.try_to('sieging')) {
        //         if (this.flag) {
        //             this.creep.memory.target_id = this.flag.id;
        //             this.creep.memory.action_name = 'moving';
        //         }
        //     }
        // }
        // console.log('guard retargeting');
        if (!super.try_to('Attack')) {
            if (this.flag) {
                super.set_target(this.flag);
            }
        }
    }

    // static create(budget: number) {
    //     // if (budget >= 10*20 + 80*10 + 50*20)
    //     //     return [
    //     //         TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
    //     //         TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
    //     //         ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
    //     //         MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
    //     //         MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
    //     //     ];
    //     if (budget >= 10 * 10 + 80 * 5 + 50 * 10)
    //         return [
    //             TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
    //             ATTACK, ATTACK, ATTACK, ATTACK,
    //             MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
    //         ];
    //     if (budget >= 10*10 + 80*5 + 50*5)
    //         return [
    //             TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
    //             ATTACK, ATTACK, ATTACK, ATTACK,
    //             MOVE, MOVE, MOVE, MOVE, MOVE,
    //         ];
    //     if (budget >= 10*6 + 80*3 + 50*3)
    //         return [
    //             TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, //60
    //             ATTACK, ATTACK, ATTACK, //240
    //             MOVE, MOVE, MOVE, //150
    //         ];
    //     else
    //         return [
    //             TOUGH, TOUGH, TOUGH, TOUGH,
    //             ATTACK, ATTACK,
    //             MOVE, MOVE,
    //         ];
    // }

    static creep_tiers = [
        {
            'cost': 10 * 20 + 80 * 10 + 50 * 20,
            'body': [
                TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
                TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
                ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK, ATTACK,
                MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
                MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
            ],
        },
        {
            'cost': 10 * 10 + 80 * 5 + 50 * 10,
            'body': [
                TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
                ATTACK, ATTACK, ATTACK, ATTACK,
                MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE, MOVE,
            ],
        },
        {
            'cost': 10 * 10 + 80 * 5 + 50 * 5,
            'body': [
                TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH,
                ATTACK, ATTACK, ATTACK, ATTACK,
                MOVE, MOVE, MOVE, MOVE, MOVE,
            ],
        },
        {
            'cost': 10 * 6 + 80 * 3 + 50 * 3,
            'body': [
                TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, TOUGH, //60
                ATTACK, ATTACK, ATTACK, //240
                MOVE, MOVE, MOVE, //150
            ],
        },
        {
            'cost': 300,
            'body': [
                TOUGH, TOUGH, TOUGH, TOUGH,
                ATTACK, ATTACK,
                MOVE, MOVE,
            ],
        },
    ];

}
CreepControllers['Guard'] = GuardCreep;
