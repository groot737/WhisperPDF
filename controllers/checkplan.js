const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const checkPlan = async (req,res) => {
    const userPlan = await prisma.subscriber.findMany({
        where: {user_id: +req.user.id}
    })
    if(userPlan){
        res.send("You've already purchased a plan")
    }else{
        next()
    }
}

module.exports= {checkPlan}