// CONNECT TO SUPABASE
const supabaseUrl = "https://kpppfqzktafjuchssiqa.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtwcHBmcXprdGFmanVjaHNzaXFhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMTg2MzgsImV4cCI6MjA4OTc5NDYzOH0.E_q4bktMrbigfn8piTj56dcc7mLihiCN_lmB-NBzsDc";

// create client (Supabase v2)
const supabaseClient = supabase.createClient(supabaseUrl, supabaseKey);


// ADD STOCK (IN)
async function addStock() {
    try {
        const name = document.getElementById("name").value;
        const qty = parseInt(document.getElementById("qty").value);

        const { data, error } = await supabaseClient
            .from("items")
            .insert([{ name: name, quantity: qty }]);

        if (error) {
            console.error(error);
            alert(error.message);
            return;
        }

        alert("Item added!");
        loadItems();

    } catch (err) {
        console.error(err);
    }
}


// REMOVE STOCK (OUT)
async function removeStock() {
    try {
        const name = document.getElementById("name").value;
        const qty = parseInt(document.getElementById("qty").value);

        const { data, error } = await supabaseClient
            .from("items")
            .select("*")
            .eq("name", name);

        if (error) {
            console.error(error);
            alert(error.message);
            return;
        }

        if (data.length === 0) {
            alert("Item not found!");
            return;
        }

        const item = data[0];
        let newQty = item.quantity - qty;

        if (newQty < 0) {
            alert("Not enough stock!");
            return;
        }

        const { error: updateError } = await supabaseClient
            .from("items")
            .update({ quantity: newQty })
            .eq("id", item.id);

        if (updateError) {
            console.error(updateError);
            alert(updateError.message);
            return;
        }

        alert("Stock updated!");
        loadItems();

    } catch (err) {
        console.error(err);
    }
}


// LOAD ITEMS
async function loadItems() {
    const { data, error } = await supabaseClient
        .from("items")
        .select("*");

    if (error) {
        console.error(error);
        return;
    }

    const list = document.getElementById("list");
    list.innerHTML = "";

    data.forEach(item => {
        const li = document.createElement("li");
        li.textContent = item.name + " - " + item.quantity;
        list.appendChild(li);
    });
}


// AUTO LOAD
loadItems();